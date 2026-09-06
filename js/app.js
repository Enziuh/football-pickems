let DATA = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  buildSeasonSelector();

  document.getElementById("seasonSelect").addEventListener("change", async (event) => {
    await loadSeason(Number(event.target.value));
  });

  document.getElementById("weekSelect").addEventListener("change", renderSelectedWeek);

  await loadSeason(PICKEM_CONFIG.currentSeason);
}

function buildSeasonSelector() {
  const select = document.getElementById("seasonSelect");
  const seasons = Object.keys(PICKEM_CONFIG.seasons).map(Number).sort((a, b) => b - a);
  select.innerHTML = "";

  seasons.forEach((season) => {
    const option = document.createElement("option");
    option.value = String(season);
    option.textContent = String(season);
    select.appendChild(option);
  });

  select.value = String(PICKEM_CONFIG.currentSeason);
}

async function loadSeason(season) {
  const cfg = PICKEM_CONFIG.seasons[season];

  if (!cfg || !cfg.api) {
    showError("This season is not configured.");
    return;
  }

  document.getElementById("seasonTitle").textContent = cfg.name || `${season} Football Pick Ems`;
  showStatus("Loading standings…");

  try {
    const response = await fetch(cfg.api, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const incoming = await response.json();

    // Browser-side defense in depth. The server is the real privacy boundary.
    assertPublicPayload(incoming);

    DATA = incoming;
    buildWeekSelector();
    renderOverall();
    renderSelectedWeek();
    hideStatus();
  } catch (error) {
    console.error(error);
    DATA = null;
    clearDashboard();
    showError("Could not load the Pick Em data.");
  }
}

function assertPublicPayload(value, path = "root") {
  const forbiddenKeys = new Set([
    "phone", "phonenumber", "phone_number",
    "email", "emailaddress", "email_address",
    "timestamp", "response", "rawresponse", "formresponse",
    "responseid", "sheetid", "spreadsheetid"
  ]);

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicPayload(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      if (forbiddenKeys.has(String(key).toLowerCase())) {
        throw new Error(`Sensitive field blocked: ${path}.${key}`);
      }
      assertPublicPayload(child, `${path}.${key}`);
    });
  }
}

function buildWeekSelector() {
  const select = document.getElementById("weekSelect");
  const weeks = Array.isArray(DATA?.weeks) ? DATA.weeks : [];
  select.innerHTML = "";

  weeks.forEach((week) => {
    const option = document.createElement("option");
    option.value = String(week);
    option.textContent = `Week ${week}`;
    select.appendChild(option);
  });

  const preferred = DATA?.activeWeek ?? weeks[0];
  if (preferred != null) select.value = String(preferred);

  document.getElementById("activeWeekBadge").textContent =
    DATA?.activeWeek ? `Current: Week ${DATA.activeWeek}` : "";
}

function renderOverall() {
  const body = document.getElementById("overallBody");
  const standings = Array.isArray(DATA?.overallStandings) ? DATA.overallStandings : [];
  body.innerHTML = "";

  if (!standings.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty-cell">No season standings yet.</td></tr>`;
    return;
  }

  standings.forEach((player) => {
    const row = document.createElement("tr");
    row.append(
      td(player.rank, "rank-cell"),
      td(player.name, "player-cell"),
      td(player.points),
      td(player.completedGames)
    );
    body.appendChild(row);
  });
}

function renderSelectedWeek() {
  if (!DATA) return;

  const week = Number(document.getElementById("weekSelect").value);
  const standings = DATA.weeklyStandings?.[week] || [];
  const games = DATA.gamesByWeek?.[week] || [];

  document.getElementById("weeklyTitle").textContent = `Week ${week} Standings`;
  document.getElementById("picksTitle").textContent = `Week ${week} Picks`;
  document.getElementById("summaryWeek").textContent = `Week ${week}`;
  document.getElementById("summaryPlayers").textContent = standings.length;

  const leaders = standings.filter((p) => standings[0] && p.points === standings[0].points);
  document.getElementById("summaryLeader").textContent =
    leaders.length === 0 ? "—" :
    leaders.length === 1 ? `${leaders[0].name} (${leaders[0].points})` :
    `${leaders.length}-way tie (${leaders[0].points})`;

  renderWeekly(standings);
  renderPicks(standings, games);
}

function renderWeekly(standings) {
  const body = document.getElementById("weeklyBody");
  body.innerHTML = "";

  if (!standings.length) {
    body.innerHTML = `<tr><td colspan="3" class="empty-cell">No picks submitted for this week.</td></tr>`;
    return;
  }

  standings.forEach((player) => {
    const row = document.createElement("tr");
    row.append(
      td(player.rank, "rank-cell"),
      td(player.name, "player-cell"),
      td(`${player.points}/${player.completedGames}`)
    );
    body.appendChild(row);
  });
}

function renderPicks(standings, games) {
  const wrap = document.getElementById("picksWrap");

  if (!games.length) {
    wrap.innerHTML = `<div class="empty-block">No games configured for this week.</div>`;
    return;
  }

  const table = document.createElement("table");
  table.className = "picks-table";

  const thead = document.createElement("thead");
  const header = document.createElement("tr");

  const playerTh = document.createElement("th");
  playerTh.textContent = "Player";
  playerTh.className = "sticky-col";
  header.appendChild(playerTh);

  games.forEach((game) => {
    const th = document.createElement("th");
    th.textContent = game;
    header.appendChild(th);
  });

  thead.appendChild(header);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  if (!standings.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = games.length + 1;
    cell.className = "empty-cell";
    cell.textContent = "No picks submitted for this week.";
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    standings.forEach((player) => {
      const row = document.createElement("tr");

      const name = document.createElement("td");
      name.textContent = player.name;
      name.className = "player-cell sticky-col";
      row.appendChild(name);

      games.forEach((game) => {
        const pick = (player.picks || []).find((item) => item.game === game);
        const cell = document.createElement("td");
        cell.className = "pick-cell";

        if (!pick) {
          cell.textContent = "—";
          cell.classList.add("pending");
        } else {
          const team = shortTeamName(pick.pick);

          if (pick.correct === true) {
            cell.textContent = `${team} ✓`;
            cell.classList.add("correct");
          } else if (pick.correct === false) {
            cell.textContent = `${team} ✕`;
            cell.classList.add("wrong");
          } else {
            cell.textContent = team;
            cell.classList.add("pending");
          }
        }

        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });
  }

  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

function td(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text ?? "—";
  if (className) cell.className = className;
  return cell;
}

function shortTeamName(value) {
  const parts = String(value || "").trim().split(/\s+/);
  return parts[parts.length - 1] || "—";
}

function showStatus(message) {
  const banner = document.getElementById("statusBanner");
  banner.textContent = message;
  banner.className = "status-banner";
  banner.hidden = false;
}

function showError(message) {
  const banner = document.getElementById("statusBanner");
  banner.textContent = message;
  banner.className = "status-banner error";
  banner.hidden = false;
}

function hideStatus() {
  document.getElementById("statusBanner").hidden = true;
}

function clearDashboard() {
  document.getElementById("overallBody").innerHTML = "";
  document.getElementById("weeklyBody").innerHTML = "";
  document.getElementById("picksWrap").innerHTML = "";
  document.getElementById("summaryWeek").textContent = "—";
  document.getElementById("summaryPlayers").textContent = "—";
  document.getElementById("summaryLeader").textContent = "—";
}
