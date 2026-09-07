import { getChargedKi, spendKi } from "./ki.mjs";

export const DBZF_MACH_DISTANCE = {
  1: { miles: 128, km: 206 },
  2: { miles: 256, km: 412 },
  3: { miles: 384, km: 618 },
  4: { miles: 512, km: 824 },
  5: { miles: 640, km: 1030 },
  6: { miles: 767, km: 1234 },
  7: { miles: 895, km: 1440 },
  8: { miles: 1023, km: 1646 },
  9: { miles: 1151, km: 1852 }
};

export function calculateTravel(actor, { mach = 0, minutes = 10, allowOverMax = false } = {}) {
  const powerTotal = Number(actor.system.skills?.power?.total || 0);
  const maxMach = Math.floor(powerTotal / 10);
  const safeMach = Math.max(0, Math.floor(Number(mach || 0)));
  const intervals = Math.max(1, Math.ceil(Number(minutes || 0) / 10));
  const costPer10Minutes = (safeMach + 1) * 10;
  const distance = distanceForMach(safeMach);
  return {
    actorName: actor.name,
    mach: safeMach,
    maxMach,
    overMax: safeMach > maxMach && !allowOverMax,
    minutes: Number(minutes || 0),
    intervals,
    costPer10Minutes,
    totalKiCost: intervals * costPer10Minutes,
    miles: distance.miles === null ? null : distance.miles * intervals,
    km: distance.km === null ? null : distance.km * intervals,
    distanceNote: distance.note
  };
}

export async function spendTravelKi(actor, travel) {
  if (travel.overMax) {
    ui.notifications.warn(`${actor.name} cannot travel at Mach ${travel.mach}; max is Mach ${travel.maxMach}.`);
    return null;
  }
  if (getChargedKi(actor) < travel.totalKiCost) {
    ui.notifications.warn(`${actor.name} does not have enough charged Ki for travel.`);
    return null;
  }
  const spent = await spendKi(actor, travel.totalKiCost);
  if (!spent.ok) return null;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: travelCard(actor, travel, spent.charged) });
  return { ...travel, kiRemaining: spent.charged };
}

export async function openTravelDialog(actor) {
  const maxMach = Math.floor(Number(actor.system.skills?.power?.total || 0) / 10);
  const options = [`<option value="0">Sub-Mach</option>`];
  for (let mach = 1; mach <= Math.max(1, maxMach); mach++) {
    const over = mach > maxMach ? " (over max)" : "";
    options.push(`<option value="${mach}">Mach ${mach}${over}</option>`);
  }
  const content = `
    <div class="dbzf-attack-dialog dbzf-dialog-form dbzf-travel-scope">
      <p class="dbzf-dialog-hint">Ki flight. Cost is (Mach + 1) x 10 Ki per 10 minutes. Max speed is Power total / 10.</p>
      <label><span>Speed</span><select name="mach">${options.join("")}</select></label>
      <label><span>Minutes</span><input name="minutes" type="number" value="10" min="1" /></label>
      <label class="dbzf-inline-check"><input name="allowOverMax" type="checkbox" /><span>Allow over max Mach</span></label>
      <dl class="dbzf-chat-grid dbzf-travel-preview">
        <dt>Max Mach</dt><dd data-preview="maxMach">${maxMach}</dd>
        <dt>Intervals</dt><dd data-preview="intervals">1</dd>
        <dt>Distance</dt><dd data-preview="distance">Sub-Mach: GM-defined tactical travel speed.</dd>
        <dt>Ki Cost</dt><dd data-preview="cost">10</dd>
      </dl>
    </div>
  `;
  const submit = async root => {
    const scope = readScope(root);
    if (!scope) return null;
    const travel = calculateTravel(actor, {
      mach: Number(fieldValue(scope, "mach") || 0),
      minutes: Number(fieldValue(scope, "minutes") || 10),
      allowOverMax: isChecked(scope, "allowOverMax")
    });
    return spendTravelKi(actor, travel);
  };

  if (foundry.applications?.api?.DialogV2) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title: "Mach Travel" },
      content,
      render: (event, dialog) => attachTravelPreview(actor, dialog.element ?? dialog),
      yes: { label: "Travel", callback: (event, button, dialog) => submit(dialog.element) },
      no: { label: "Cancel" }
    });
  }

  return new Promise(resolve => new Dialog({
    title: "Mach Travel",
    content,
    buttons: {
      travel: { label: "Travel", callback: html => resolve(submit(html[0] ?? html)) },
      cancel: { label: "Cancel", callback: () => resolve(null) }
    },
    render: html => attachTravelPreview(actor, html[0] ?? html),
    default: "travel"
  }).render(true));
}

// The dialog body is a <div>, not a <form>: a nested <form> inside DialogV2's own form is dropped
// by the HTML parser. Read the controls directly so this works under both dialog implementations.
function readScope(root) {
  if (!root) return null;
  return root.querySelector?.(".dbzf-travel-scope") ?? root.querySelector?.(".dbzf-dialog-form") ?? root;
}

function fieldValue(scope, name) {
  return scope.querySelector(`[name="${name}"]`)?.value ?? "";
}

function isChecked(scope, name) {
  return scope.querySelector(`[name="${name}"]`)?.checked === true;
}

function attachTravelPreview(actor, root) {
  const scope = readScope(root);
  if (!scope) return;
  const update = () => {
    const travel = calculateTravel(actor, {
      mach: Number(fieldValue(scope, "mach") || 0),
      minutes: Number(fieldValue(scope, "minutes") || 10),
      allowOverMax: isChecked(scope, "allowOverMax")
    });
    const distance = travel.miles === null ? travel.distanceNote : `${travel.miles} miles / ${travel.km} km`;
    const set = (key, value) => { const node = scope.querySelector(`[data-preview="${key}"]`); if (node) node.textContent = value; };
    set("maxMach", travel.maxMach);
    set("intervals", travel.intervals);
    set("distance", distance);
    set("cost", travel.overMax ? `${travel.totalKiCost} (over max)` : travel.totalKiCost);
  };
  scope.addEventListener("input", update);
  scope.addEventListener("change", update);
  update();
}

function distanceForMach(mach) {
  if (mach <= 0) return { miles: null, km: null, note: "Sub-Mach: GM-defined tactical travel speed." };
  return DBZF_MACH_DISTANCE[mach] ?? { miles: Math.round(128 * mach), km: Math.round(206 * mach), note: "" };
}

function travelCard(actor, travel, kiRemaining) {
  const distance = travel.miles === null ? travel.distanceNote : `${travel.miles} miles / ${travel.km} km`;
  return `
    <article class="dbzf-chat-card" data-kind="action">
      <header><h3>Mach Travel</h3><p>${actor.name}</p></header>
      <dl class="dbzf-chat-grid">
        <dt>Speed</dt><dd>${travel.mach ? `Mach ${travel.mach}` : "Sub-Mach"}</dd>
        <dt>Duration</dt><dd>${travel.minutes} minutes (${travel.intervals} interval(s))</dd>
        <dt>Distance</dt><dd>${distance}</dd>
        <dt>Ki Cost</dt><dd>${travel.totalKiCost}</dd>
        <dt>Ki Remaining</dt><dd>${kiRemaining}</dd>
      </dl>
    </article>
  `;
}
