// PlanMyDay — the job edit page (general/schedule/tasks tabs, view + delete).

// JOBS EDITOR
var jobsStreamIndex = -1;
var jobsEditingIdx = -1;
var jobsBuffer = null;
var isNewJob = false;
var jobsTargetStreamIndex = -1;
var jobTasksSortable = null;

function jobField(field, value) {
  if (!jobsBuffer) return;
  jobsBuffer[field] = value;
}
function jobTimeChanged() {
  const h = $id("jobTimeHour").value;
  const m = $id("jobTimeMin").value;
  jobField("time", h && m ? h + ":" + m : "");
}
function updateJobEditOkBtn() {
  const okBtn = getJobEditFooterBtn("done");
  if (!okBtn) return;
  const title = $id("jobTitleInput");
  okBtn.disabled = !title || !title.value.trim();
}
function jobAddTask() {
  if (!jobsBuffer) return;
  if (!jobsBuffer.tasks) jobsBuffer.tasks = [];
  jobsBuffer.tasks.push({ description: "", done: false, note: "" });
  renderJobTasks();
  var listEl = $id("jobTasksList");
  var inputs = listEl ? listEl.querySelectorAll(".task-desc-input") : [];
  var last = inputs[inputs.length - 1];
  if (last) {
    last.focus();
    last.scrollIntoView({ block: "nearest" });
  }
}

function jobAddTaskTop() {
  if (!jobsBuffer) return;
  if (!jobsBuffer.tasks) jobsBuffer.tasks = [];
  jobsBuffer.tasks.unshift({ description: "", done: false, note: "" });
  renderJobTasks();
  var first = $id("jobTasksList");
  first = first ? first.querySelector(".task-desc-input") : null;
  if (first) {
    first.focus();
    first.scrollIntoView({ block: "nearest" });
  }
}

function jobDeleteTask(index) {
  if (!jobsBuffer || !jobsBuffer.tasks) return;
  var taskText = (jobsBuffer.tasks[index] && jobsBuffer.tasks[index].description) ? jobsBuffer.tasks[index].description : "Unnamed task";
  showSmdModal({
    title: "Delete Task?",
    content: 'Delete task "' + escapeHtml(taskText) + '"?',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function(detail) {
      if (detail.action !== "delete") return;
      jobsBuffer.tasks.splice(index, 1);
      renderJobTasks();
    }
  });
}

function jobTaskField(index, field, value) {
  if (!jobsBuffer || !jobsBuffer.tasks) return;
  jobsBuffer.tasks[index][field] = value;
  if (field === "note") {
    var list = $id("jobTasksList");
    if (list) {
      var row = list.querySelector('.task-row[data-task-index="' + index + '"]');
      if (row) setTaskNoteBtnClass(row.querySelector(".task-note-btn"), jobsBuffer.tasks[index]);
    }
  }
}

function taskNoteOpen(task) {
  if (!task) return false;
  if (task.noteOpen === undefined) return !!task.note;
  return task.noteOpen;
}

function setTaskNoteBtnClass(btn, task) {
  if (!btn) return;
  var hasNote = !!(task && task.note);
  btn.classList.toggle("btn-outline-info", hasNote);
  btn.classList.toggle("btn-info", !hasNote);
}

function renderJobTasks() {
  var el = $id("jobTasksList");
  if (!el || !jobsBuffer) return;
  var tasks = jobsBuffer.tasks || [];
  var html = "";
  tasks.forEach(function(task, i) {
    html += '<div class="d-flex align-items-center gap-2 mb-1 task-row task-drag-card" data-task-index="' + i + '">' +
      '<smd-draghandle class="drag-handle"></smd-draghandle>' +
      '<smd-checkbox class="task-done-cb" id="taskDone' + i + '" ' + (task.done ? "checked" : "") + ' onchange="jobTaskField(' + i + ', \'done\', this.checked)"></smd-checkbox>' +
      '<input class="form-control task-desc-input" value="' + escapeHtml(task.description || "") + '" placeholder="Task description" oninput="jobTaskField(' + i + ', \'description\', this.value)">' +
      '<button class="btn btn-sm ' + (task.note ? 'btn-outline-info' : 'btn-info') + ' task-note-btn" onclick="jobTaskToggleNote(this, ' + i + ')" title="Note"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.854 2.56a.5.5 0 0 0-.707 0L1.5 10.207V14.5h4.293L13.5 6.207zM12.793 3.207L4 12V14h2L13.793 4.207l-1-1z"/></svg></button>' +
      '<button class="btn btn-sm btn-danger d-flex align-items-center justify-content-center" style="width:32px;height:32px" onclick="jobDeleteTask(' + i + ')" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg></button>' +
      '</div>' +
      '<div class="task-note-row mb-1 ms-4" id="taskNoteRow' + i + '" style="display:' + (taskNoteOpen(task) ? 'block' : 'none') + '">' +
        '<textarea class="form-control" rows="2" placeholder="Note" oninput="jobTaskField(' + i + ', \'note\', this.value)">' + escapeHtml(task.note || "") + '</textarea>' +
      '</div>';
  });
  el.innerHTML = html;
  var topBtn = $id("jobAddTaskBtn");
  if (topBtn) {
    topBtn.style.display = tasks.length >= 1 ? "" : "none";
  }
  initJobTasksSortable();
}

function initJobTasksSortable() {
  if (jobTasksSortable) {
    jobTasksSortable.destroy();
    jobTasksSortable = null;
  }
  if (typeof Sortable === "undefined") return;
  var el = $id("jobTasksList");
  if (!el || !jobsBuffer) return;
  if (!el.querySelector(".drag-handle")) return;
  jobTasksSortable = new Sortable(el, {
    handle: ".drag-handle",
    draggable: ".task-row",
    animation: 150,
    onEnd: function() {
      if (!jobsBuffer || !jobsBuffer.tasks) return;
      var reordered = [];
      el.querySelectorAll(".task-row").forEach(function(row) {
        var idx = parseInt(row.getAttribute("data-task-index"), 10);
        if (idx >= 0 && idx < jobsBuffer.tasks.length) reordered.push(jobsBuffer.tasks[idx]);
      });
      if (reordered.length !== jobsBuffer.tasks.length) return;
      jobsBuffer.tasks = reordered;
      renderJobTasks();
    }
  });
}

function jobTaskToggleNote(btn, index) {
  var row = $id("taskNoteRow" + index);
  if (!row) return;
  row.style.display = row.style.display === "none" ? "block" : "none";
  var shown = row.style.display === "block";
  if (jobsBuffer && jobsBuffer.tasks && jobsBuffer.tasks[index]) {
    jobsBuffer.tasks[index].noteOpen = shown;
  }
  if (btn && jobsBuffer && jobsBuffer.tasks) {
    setTaskNoteBtnClass(btn, jobsBuffer.tasks[index]);
  }
}

function scheduleEl(id) {
  const host = document.getElementById("smdConfirmModal");
  return host ? host.querySelector("#" + id) : null;
}
function scheduleRadios() {
  const host = document.getElementById("smdConfirmModal");
  return host ? host.querySelectorAll('input[name="scheduleType"]') : [];
}

function getScheduleFormHTML() {
  return `
    <div class="mb-3">
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedDaily" value="daily" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedDaily">Every day</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedNDays" value="ndays" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedNDays">Every n days</label>
      </div>
      <div id="schedNDaysOptions" class="d-none ms-4 mb-2">
        <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
          <label class="form-label mb-0">Every</label>
          <select class="form-select" id="schedNInterval" onchange="onScheduleNDaysChange()" style="width:auto;min-width:60px"></select>
          <label class="form-label mb-0">day(s)</label>
          <label class="form-label mb-0 ms-2">Offset</label>
          <select class="form-select" id="schedNOffset" onchange="onScheduleNDaysChange()" style="width:auto;min-width:60px"></select>
        </div>
        <div id="schedNextDue" class="text-muted small"></div>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedWeekdays" value="weekdays" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedWeekdays">Weekdays (Mon&ndash;Fri)</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedWeekends" value="weekends" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedWeekends">Weekends (Sat&ndash;Sun)</label>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedDays" value="days" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedDays">Specific days</label>
      </div>
      <div id="schedDaysOptions" class="d-none ms-4 mb-2 d-flex gap-2 flex-wrap">
        <smd-checkbox id="schedDay0" value="0">Sun</smd-checkbox>
        <smd-checkbox id="schedDay1" value="1">Mon</smd-checkbox>
        <smd-checkbox id="schedDay2" value="2">Tue</smd-checkbox>
        <smd-checkbox id="schedDay3" value="3">Wed</smd-checkbox>
        <smd-checkbox id="schedDay4" value="4">Thu</smd-checkbox>
        <smd-checkbox id="schedDay5" value="5">Fri</smd-checkbox>
        <smd-checkbox id="schedDay6" value="6">Sat</smd-checkbox>
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="radio" name="scheduleType" id="schedMonthly" value="monthly" onchange="onScheduleTypeChange()">
        <label class="form-check-label" for="schedMonthly">Day of month</label>
      </div>
      <div id="schedMonthlyOptions" class="d-none ms-4 mb-2">
        <select class="form-select" id="schedMonthlyDay" style="width:auto"></select>
      </div>
    </div>
  `;
}

function openScheduleModal() {
  const s = (jobsBuffer && jobsBuffer.schedule) || { type: "daily" };
  showSmdModal({
    title: "Schedule",
    content: getScheduleFormHTML(),
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "OK", variant: "primary", action: "ok" }
    ],
    onAction: function(detail) {
      if (detail.action === "ok") saveScheduleModal();
    }
  });
  const host = document.getElementById("smdConfirmModal");
  if (host) injectStyleInto(SCHEDULE_MODAL_STYLES);
  scheduleRadios().forEach(r => r.checked = r.value === s.type);
  scheduleEl("schedDaysOptions").classList.toggle("d-none", s.type !== "days");
  scheduleEl("schedMonthlyOptions").classList.toggle("d-none", s.type !== "monthly");
  scheduleEl("schedNDaysOptions").classList.toggle("d-none", s.type !== "ndays");
  for (let i = 0; i < 7; i++) {
    scheduleEl("schedDay" + i).checked = (s.days || []).includes(i);
  }
  const mSel = scheduleEl("schedMonthlyDay");
  mSel.innerHTML = "";
  for (let i = 1; i <= 31; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    if (i === (s.date || 1)) opt.selected = true;
    mSel.appendChild(opt);
  }
  const intervalSel = scheduleEl("schedNInterval");
  intervalSel.innerHTML = "";
  for (let i = 2; i <= 7; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    if (i === (s.interval || 2)) opt.selected = true;
    intervalSel.appendChild(opt);
  }
  const curInterval = s.interval || 2;
  const offsetSel = scheduleEl("schedNOffset");
  offsetSel.innerHTML = "";
  for (let i = 0; i < curInterval; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    if (i === (s.offset ?? 0)) opt.selected = true;
    offsetSel.appendChild(opt);
  }
  if (s.type === "ndays") onScheduleNDaysChange();
}

function onScheduleTypeChange() {
  let checked = null;
  scheduleRadios().forEach(r => { if (r.checked) checked = r; });
  const type = checked ? checked.value : "daily";
  scheduleEl("schedDaysOptions").classList.toggle("d-none", type !== "days");
  scheduleEl("schedMonthlyOptions").classList.toggle("d-none", type !== "monthly");
  scheduleEl("schedNDaysOptions").classList.toggle("d-none", type !== "ndays");
  if (type === "ndays") onScheduleNDaysChange();
}

function onScheduleNDaysChange() {
  const interval = parseInt(scheduleEl("schedNInterval").value, 10) || 2;
  const offsetSel = scheduleEl("schedNOffset");
  const currentOffset = parseInt(offsetSel.value, 10) || 0;
  offsetSel.innerHTML = "";
  for (let i = 0; i < interval; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    if (i === Math.min(currentOffset, interval - 1)) opt.selected = true;
    offsetSel.appendChild(opt);
  }
  const offset = parseInt(offsetSel.value, 10) || 0;
  scheduleEl("schedNextDue").textContent = getNextDueText(interval, offset);
}

function saveScheduleModal() {
  let checked = null;
  scheduleRadios().forEach(r => { if (r.checked) checked = r; });
  const type = checked ? checked.value : "daily";
  let schedule = { type: type };
  if (type === "days") {
    schedule.days = [];
    for (let i = 0; i < 7; i++) {
      if (scheduleEl("schedDay" + i).checked) schedule.days.push(i);
    }
    if (schedule.days.length === 0) schedule = { type: "daily" };
  } else if (type === "monthly") {
    schedule.date = parseInt(scheduleEl("schedMonthlyDay").value, 10) || 1;
  } else if (type === "ndays") {
    schedule.interval = parseInt(scheduleEl("schedNInterval").value, 10) || 2;
    schedule.offset = parseInt(scheduleEl("schedNOffset").value, 10) || 0;
  }
  jobField("schedule", schedule);
  const el = $id("jobScheduleText");
  if (el) el.textContent = getScheduleText(schedule);
}

function getJobEditPageContent(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  const ro = readOnly ? "readonly" : "";
  return `
    <div class="row mb-1">
      <div class="col">
        <label class="form-label">Title</label>
      </div>
      <div class="col-auto d-flex align-items-center">
        <smd-checkbox id="jobActiveCb" ${data.active !== false ? "checked" : ""} ${disabled} onchange="jobField('active', this.checked)">Active</smd-checkbox>
      </div>
    </div>
    <div class="mb-2">
      <input class="form-control" id="jobTitleInput" value="${escapeHtml(data.title || "")}" ${ro} oninput="jobField('title', this.value);updateJobEditOkBtn()" ${readOnly ? "" : "onkeydown=\"if(event.key==='Enter') jobEditOk()\""}>
    </div>
    <smd-tabs id="jobEditTabs"></smd-tabs>
  `;
}

function getJobEditSections(data, readOnly) {
  return [
    { title: "General", id: "jobGeneral-tab", content: getJobGeneralTabHTML(data, readOnly) },
    { title: "Schedule", id: "jobSchedule-tab", content: getJobScheduleTabHTML(data, readOnly) },
    { title: "Tasks", id: "jobTasks-tab", content: getJobTasksTabHTML(data, readOnly), panelClass: "no-padding" }
  ];
}

function getJobGeneralTabHTML(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  return `
    <div class="row mb-2 mt-2">
      <div class="col-6 d-flex flex-column" style="min-height:61px">
        <label class="form-label mb-0">Stream</label>
        <div class="mt-1" style="flex-grow:1">
          <smd-image-dropdown id="jobStreamDropdown" key-prefix="${escAttr(smdImagePrefix())}" ${readOnly ? "disabled" : ""}></smd-image-dropdown>
        </div>
      </div>
      <div class="col-6 d-flex flex-column" style="min-height:61px">
        <label class="form-label mb-0">Image</label>
        <div class="d-flex align-items-center mt-1" style="flex-grow:1">
          <smd-image-select id="jobImageSelect" key-prefix="${escAttr(smdImagePrefix())}" image="${escapeHtml(data.image || "")}" label-id="jobImageName" button-id="btnJobImageChange" ${readOnly ? "disabled" : ""}></smd-image-select>
        </div>
      </div>
    </div>
    <div class="mb-2">
      <label class="form-label">Description</label>
      <textarea class="form-control" rows="3" ${readOnly ? "readonly" : ""} oninput="jobField('description', this.value)">${escapeHtml(data.description || "")}</textarea>
    </div>
    <div class="row mb-2">
      <div class="col-auto d-flex align-items-center">
        <smd-checkbox id="jobSuffixCb" ${data.suffix ? "checked" : ""} ${disabled} onchange="jobField('suffix', this.checked)">Suffix</smd-checkbox>
      </div>
      <div class="col">
        <select class="form-select" ${disabled} onchange="jobField('dayType', this.value)">
          <option value="dayOfYear" ${(data.dayType || "dayOfYear") === "dayOfYear" ? "selected" : ""}>Day of Year</option>
          <option value="dayOfMonth" ${data.dayType === "dayOfMonth" ? "selected" : ""}>Day of Month</option>
          <option value="dayOfWeek" ${data.dayType === "dayOfWeek" ? "selected" : ""}>Day of Week</option>
        </select>
      </div>
      <div class="col">
        <select class="form-select" ${disabled} onchange="jobField('mod', this.value)">
          <option value="" ${!data.mod ? "selected" : ""}>None</option>
          <option value="2" ${data.mod === "2" ? "selected" : ""}>2</option>
          <option value="3" ${data.mod === "3" ? "selected" : ""}>3</option>
          <option value="4" ${data.mod === "4" ? "selected" : ""}>4</option>
          <option value="5" ${data.mod === "5" ? "selected" : ""}>5</option>
          <option value="6" ${data.mod === "6" ? "selected" : ""}>6</option>
          <option value="7" ${data.mod === "7" ? "selected" : ""}>7</option>
        </select>
      </div>
    </div>
  `;
}

function getJobScheduleTabHTML(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  const ro = readOnly ? "readonly" : "";
  return `
    <div class="mb-2 mt-2">
      <label class="form-label">Schedule</label>
      <div class="d-flex align-items-center gap-2">
        <span id="jobScheduleText">${escapeHtml(getScheduleText(data.schedule))}</span>
        <button class="btn btn-primary btn-sm" id="btnScheduleChange" ${disabled} onclick="openScheduleModal()">Edit</button>
      </div>
    </div>
    <div class="row mb-2">
      <div class="col">
        <label class="form-label">Sleep Until</label>
        <smd-date-picker ${readOnly ? "readonly" : ""} value="${escapeHtml(data.sleepUntil || "")}" first-day-of-week="${parseInt(localStorage.getItem(smdKey("startWeek")) || "1", 10)}"></smd-date-picker>
      </div>
    </div>
    <div class="row mb-2">
      <div class="col">
        <label class="form-label">Wait for</label>
        <input class="form-control" id="jobWaitFor" value="${escapeHtml(data.waitFor || "")}" ${ro} placeholder="e.g. the delivery to arrive" oninput="jobField('waitFor', this.value)">
      </div>
    </div>
    <div class="row mb-2">
      <div class="col">
        <label class="form-label">Schedule Time</label>
        <div class="d-flex gap-2">
          <select class="form-select" id="jobTimeHour" ${disabled} onchange="jobTimeChanged()" style="width:auto">
            <option value="" ${!data.time ? "selected" : ""}>-</option>
            ${Array.from({length: 24}, (_, i) => {
              const h = String(i).padStart(2, "0");
              const cur = data.time ? data.time.split(":")[0] : "";
              return `<option value="${h}" ${cur === h ? "selected" : ""}>${h}</option>`;
            }).join("")}
          </select>
          <span class="align-self-center">:</span>
          <select class="form-select" id="jobTimeMin" ${disabled} onchange="jobTimeChanged()" style="width:auto">
            <option value="" ${!data.time ? "selected" : ""}>-</option>
            <option value="00" ${data.time && data.time.split(":")[1] === "00" ? "selected" : ""}>00</option>
            <option value="15" ${data.time && data.time.split(":")[1] === "15" ? "selected" : ""}>15</option>
            <option value="30" ${data.time && data.time.split(":")[1] === "30" ? "selected" : ""}>30</option>
            <option value="45" ${data.time && data.time.split(":")[1] === "45" ? "selected" : ""}>45</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

function getJobTasksTabHTML(data, readOnly) {
  const disabled = readOnly ? "disabled" : "";
  const ro = readOnly ? "readonly" : "";
  const tasks = data.tasks || [];
  let tasksHTML = "";
  tasks.forEach(function(task, i) {
    var dragHandleHtml = readOnly ? "" : '<smd-draghandle class="drag-handle"></smd-draghandle>';
    tasksHTML += `
      <div class="d-flex align-items-center gap-2 mb-1 task-row task-drag-card" data-task-index="${i}">
        ${dragHandleHtml}
        <smd-checkbox class="task-done-cb" ${task.done ? "checked" : ""} ${disabled} onchange="jobTaskField(${i}, 'done', this.checked)"></smd-checkbox>
        <input class="form-control task-desc-input" value="${escapeHtml(task.description || "")}" ${ro} placeholder="Task description" oninput="jobTaskField(${i}, 'description', this.value)">
        <button class="btn btn-sm ${task.note ? 'btn-outline-info' : 'btn-info'} task-note-btn" ${disabled} onclick="jobTaskToggleNote(this, ${i})" title="Note"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.854 2.56a.5.5 0 0 0-.707 0L1.5 10.207V14.5h4.293L13.5 6.207zM12.793 3.207L4 12V14h2L13.793 4.207l-1-1z"/></svg></button>
        <button class="btn btn-sm btn-danger d-flex align-items-center justify-content-center" style="width:32px;height:32px" ${disabled} onclick="jobDeleteTask(${i})" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg></button>
      </div>
      <div class="task-note-row mb-1 ms-4" id="taskNoteRow${i}" style="display:${taskNoteOpen(task) ? 'block' : 'none'}">
        <textarea class="form-control" rows="2" placeholder="Note" ${ro} oninput="jobTaskField(${i}, 'note', this.value)">${escapeHtml(task.note || "")}</textarea>
      </div>`;
  });
  return `
    <div class="mt-2">
      <button class="btn btn-primary mb-2" id="jobAddTaskBtn" ${disabled} onclick="jobAddTaskTop()">Add Task</button>
      <div id="jobTasksList">${tasksHTML}</div>
      <div class="mt-2">
        <button class="btn btn-primary" id="jobAddTaskBottomBtn" ${disabled} onclick="jobAddTask()">Add Task</button>
      </div>
    </div>
  `;
}

var _jobEditButtons = [];
var _jobEditCloseTimer = null;

function buildJobEditPage(readOnly, activeTabIndex) {
  if (!jobsBuffer) return;
  const data = jobsBuffer;
  const title = readOnly ? "View Job" : (isNewJob ? "Add Job" : "Edit Job");
  const page = document.getElementById("jobEditPage");
  if (!page) return;

  destroyJobEditTransient();
  if (_jobEditCloseTimer) {
    clearTimeout(_jobEditCloseTimer);
    _jobEditCloseTimer = null;
  }
  jobsTargetStreamIndex = jobsStreamIndex;

  _jobEditButtons = readOnly
    ? [
        { text: "Edit", variant: "primary", action: "edit", id: "btnViewJobEdit", close: false },
        { text: "OK", variant: "success", action: "cancel", id: "jobEditOkBtn" }
      ]
    : [
        { text: "Cancel", variant: "secondary", action: "cancel", id: "jobEditCancelBtn" },
        ...(isNewJob ? [] : [{ text: "Delete", variant: "danger", action: "delete", id: "jobEditDelBtn" }]),
        { text: "OK", variant: "success", action: "done", id: "jobEditOkBtn" }
      ];

  page.classList.remove("d-none");
  page.title = title;
  page.content = getJobEditPageContent(data, readOnly);
  page.buttons = _jobEditButtons;

  const tabsEl = $id("jobEditTabs");
  if (tabsEl) {
    tabsEl.tabs = getJobEditSections(data, readOnly);
    if (typeof activeTabIndex === "number" && activeTabIndex > 0 && activeTabIndex < tabsEl.tabs.length) {
      tabsEl.activeIndex = activeTabIndex;
    }
  }
  injectJobEditStyles();
  initJobStreamSelect();
  if (!readOnly) {
    initJobTasksSortable();
    renderJobTasks();
    updateJobEditOkBtn();
  }
  page.show();
  if (!readOnly && isNewJob) focusJobTitle();
}

function destroyJobEditTransient() {
  if (jobTasksSortable) {
    jobTasksSortable.destroy();
    jobTasksSortable = null;
  }
}

function hideJobEditPage() {
  destroyJobEditTransient();
  const page = document.getElementById("jobEditPage");
  if (page) {
    page.hide();
    clearTimeout(_jobEditCloseTimer);
    _jobEditCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
}

function focusJobTitle() {
  requestAnimationFrame(function() {
    var el = $id("jobTitleInput");
    if (el) el.focus();
  });
}

function getJobEditFooterBtn(action) {
  const page = document.getElementById("jobEditPage");
  if (!page) return null;
  const config = _jobEditButtons.find(function(b) { return b.action === action; });
  if (!config || !config.id) return null;
  return page.querySelector("#" + config.id);
}

function jobEditOk() {
  const okBtn = getJobEditFooterBtn("done");
  if (okBtn && okBtn.disabled) return;
  doneJobEdit();
}

function editJobFromView() {
  if (!jobsBuffer) return;
  var activeIdx = 0;
  var tabsEl = $id("jobEditTabs");
  if (tabsEl) activeIdx = tabsEl.activeIndex;
  buildJobEditPage(false, activeIdx);
}

function viewJobReadOnly(streamIdx, jobIdx) {
  const streams = loadStreams();
  const stream = streams[streamIdx];
  if (!stream) return;
  const jobs = stream.jobs || [];
  const job = jobs[jobIdx];
  if (!job) return;
  jobsBuffer = JSON.parse(JSON.stringify(job));
  if (jobsBuffer.sleepUntil) {
    const today = getTodayStr();
    if (jobsBuffer.sleepUntil < today) jobsBuffer.sleepUntil = "";
  }
  jobsStreamIndex = streamIdx;
  jobsEditingIdx = jobIdx;
  isNewJob = false;
  buildJobEditPage(true);
}

function editJob(index) {
  var streams = loadStreams();
  var jobs = streams[jobsStreamIndex].jobs || [];
  jobsBuffer = JSON.parse(JSON.stringify(jobs[index]));
  if (jobsBuffer.sleepUntil) {
    var today = getTodayStr();
    if (jobsBuffer.sleepUntil < today) jobsBuffer.sleepUntil = "";
  }
  jobsEditingIdx = index; isNewJob = false;
  buildJobEditPage(false);
}

function cancelJobEdit() {
  hideJobEditPage();
  if (isNewJob && jobsEditingIdx >= 0) {
    var streams = loadStreams();
    var jobs = streams[jobsStreamIndex].jobs || [];
    jobs.splice(jobsEditingIdx, 1);
    streams[jobsStreamIndex].jobs = jobs;
    saveStreams(streams);
  }
  jobsEditingIdx = -1; jobsBuffer = null; isNewJob = false; jobsTargetStreamIndex = -1;
  refreshActiveView();
}

function doneJobEdit() {
  var view = activeEditorView();
  var savedId = null;
  if (jobsEditingIdx >= 0 && jobsBuffer) {
    var streams = loadStreams();
    savedId = jobsBuffer.id;
    if (jobsTargetStreamIndex >= 0 && jobsTargetStreamIndex !== jobsStreamIndex) {
      var oldJobs = streams[jobsStreamIndex].jobs || [];
      oldJobs.splice(jobsEditingIdx, 1);
      oldJobs.forEach(function(j, i) { j.sequence = i + 1; });
      streams[jobsStreamIndex].jobs = oldJobs;
      var newJobs = streams[jobsTargetStreamIndex].jobs || [];
      jobsBuffer.sequence = newJobs.length + 1;
      newJobs.push(jobsBuffer);
      streams[jobsTargetStreamIndex].jobs = newJobs;
    } else {
      var jobs = streams[jobsStreamIndex].jobs || [];
      jobs[jobsEditingIdx] = jobsBuffer;
      streams[jobsStreamIndex].jobs = jobs;
    }
    saveStreams(streams);
  }
  hideJobEditPage();
  jobsEditingIdx = -1; jobsBuffer = null; isNewJob = false; jobsTargetStreamIndex = -1;
  if (view === "main") {
    var streams = loadStreams();
    var order = loadTodayOrder() || [];
    var allActive = [];
    streams.forEach(function(t) { (t.jobs || []).forEach(function(j) { if (j.active !== false) allActive.push(j.id); }); });
    var remaining = order.filter(function(id) { return allActive.includes(id); });
    allActive.forEach(function(id) { if (!remaining.includes(id)) remaining.push(id); });
    if (savedId && !remaining.includes(savedId)) remaining.push(savedId);
    saveTodayOrder(remaining);
  } else if (view === "streams") {
    var editorStreams = loadStreams();
    var savedJob = null;
    editorStreams.forEach(function(t) {
      if (!savedJob) {
        var found = (t.jobs || []).find(function(j) { return j.id === savedId; });
        if (found) savedJob = found;
      }
    });
    if (savedId && savedJob && savedJob.active !== false && shouldShowJobToday(savedJob)) {
      var editorOrder = loadTodayOrder() || [];
      if (editorOrder.indexOf(savedId) === -1) {
        editorOrder.push(savedId);
        saveTodayOrder(editorOrder);
      }
    }
  }
  refreshActiveView();
}

function deleteJobFromEdit() {
  var idx = jobsEditingIdx;
  hideJobEditPage();
  confirmDeleteJob(idx);
}

function deleteJobFromStream(streamIdx, index) {
  var s = loadStreams();
  var stream = s[streamIdx];
  if (!stream) return null;
  var jbs = stream.jobs || [];
  var deletedId = (jbs[index] || {}).id;
  jbs.splice(index, 1);
  jbs.forEach(function(j, i) { j.sequence = i + 1; });
  stream.jobs = jbs;
  saveStreams(s);
  if (deletedId) {
    var order = loadTodayOrder();
    if (order) {
      order = order.filter(function(id) { return id !== deletedId; });
      saveTodayOrder(order);
    }
    var completed = loadCompletedJobs();
    if (completed.indexOf(deletedId) !== -1) {
      saveCompletedJobs(completed.filter(function(id) { return id !== deletedId; }));
    }
  }
  return deletedId;
}

function confirmDeleteJob(index) {
  jobsEditingIdx = index;
  var streams = loadStreams();
  var stream = streams[jobsStreamIndex] || {};
  var jobs = stream.jobs || [];
  var job = jobs[index] || {};
  showSmdModal({
    title: "Delete Job?",
    content: 'Delete "' + escapeHtml(job.title || "") + '" from "' + escapeHtml(stream.title || "") + '"?',
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function(detail) {
      if (detail.action !== "delete") return;
      deleteJobFromStream(jobsStreamIndex, index);
      jobsEditingIdx = -1; jobsBuffer = null; isNewJob = false;
      refreshActiveView();
    }
  });
}

function addNewJob() {
  var streams = loadStreams();
  var jobs = streams[jobsStreamIndex].jobs || [];
  var seq = jobs.length + 1;
  var newJob = { id: "job_" + Date.now(), title: "", sequence: seq, description: "", active: true, frequency: "daily", time: "", sleepUntil: "", waitFor: "", schedule: { type: "daily" }, tasks: [] };
  jobs.push(newJob);
  streams[jobsStreamIndex].jobs = jobs;
  saveStreams(streams);
  jobsBuffer = JSON.parse(JSON.stringify(newJob));
  jobsEditingIdx = jobs.length - 1; isNewJob = true;
  buildJobEditPage(false);
}
