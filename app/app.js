const APP_NAME = "nemui";
const APP_URL = APP_NAME + ".osc.garden"
const STORAGE_KEY = "sleepScheduleState";
const STORAGE_KEY_WIZARD = "sleepScheduleWizardState";
const SAVE_DELAY = 500; // Milliseconds before saving state.

// Time-related constants.
const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DEGREES_PER_HOUR = 15;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MINUTES_PER_HALF_DAY = MINUTES_PER_DAY / 2;

// Geometric constants.
const DEGREES_IN_CIRCLE = 360;
const DEGREES_IN_HALF_CIRCLE = 180;
const DEGREES_90 = 90;

// Visual/UI constants.
const MAX_MINUTES_PER_DAY_RECOMMENDED = 30;
const MIN_MINUTES_PER_DAY_RECOMMENDED = 15;
const HOUR_SUFFIX = " hr";
const HOUR_MIN_FORMAT = " hr ";
const MIN_SUFFIX = " min";
const RECOMMENDATION_HOURS_PREFIX = "Tip: ";
const WARNING_ICON = "<span class='icon warning-icon'></span>";
const GOAL_MET_MESSAGE = "This schedule meets your sleep goal.";
const GOAL_NOT_MET_MESSAGE = `${WARNING_ICON} This schedule does not meet your sleep goal.`;
const DATE_ADJUSTMENT_MESSAGE = (minutes) =>
  minutes <= MAX_MINUTES_PER_DAY_RECOMMENDED
    ? `Schedule shifts by ${minutes} minutes each day.`
    : `${WARNING_ICON} Schedule shifts by ${minutes} minutes each day.`;
const WARNING_CLASS = "warning";
const currentContainer = document.getElementById("currentScheduleContainer");
const goalContainer = document.getElementById("goalScheduleContainer");
const calendarAdjustmentMessage = document.getElementById(
  "calendarAdjustmentMessage"
);

// Calendar.
const CALENDAR_CONSTANTS = {
  MINUTES_BEFORE_BEDTIME: 0,
  EVENT_DURATION: 30,
  REMINDER_BEFORE_MINUTES: 33,
  LINE_ENDING: "\r\n",
};
const CALENDAR_MESSAGES = {
  EVENT_TITLE: (bedTime, wakeTime) => `🛏️ ${bedTime} ⏰ ${wakeTime}`,
  EVENT_DESCRIPTION: (bedtime, wakeTime) =>
    `Go to bed at ${bedtime}, wake up at ${wakeTime}.\nSleep tight〜`,
  REMINDER_DESCRIPTION: "Time to start preparing for bed",
  CALENDAR_PRODUCER: `-//${APP_NAME}//EN`,
};

// Derived constants.
const MINUTES_TO_ANGLE = MINUTES_PER_HOUR / DEGREES_PER_HOUR; // = 4
const DEGREES_PER_MINUTE = DEGREES_IN_CIRCLE / (24 * MINUTES_PER_HOUR); // = 0.25
const SNAP_TO_MINUTES = 5;
const SNAP_TO_DEGREES = DEGREES_PER_MINUTE * SNAP_TO_MINUTES;

let dstChange = null; // Stores DST change for the session.

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const Storage = {
  get() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};
    const state = JSON.parse(saved);
    // Is schedule expired?
    if (state.targetDate) {
      const targetDate = new Date(state.targetDate);
      const today = new Date();
      if (targetDate < today) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY_WIZARD);
        return {};
      }
    }
    return state;
  },
  save(updates) {
    const state = this.get();
    const newState = { ...state, ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  },
};

function addDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

// Convert "HH:MM" time string to "minutes since midnight".
function timeToMinutes(time) {
  const { hours, minutes } = parseTime(time);
  return hours * 60 + minutes;
}

function parseTime(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  return { hours, minutes };
}

function adjustMinutes(minutes, adjustment) {
  return (minutes + adjustment + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function calculateMinutesDiff(time1, time2) {
  let diff = timeToMinutes(time2) - timeToMinutes(time1);
  if (diff > MINUTES_PER_HALF_DAY) diff -= MINUTES_PER_DAY;
  if (diff < -MINUTES_PER_HALF_DAY) diff += MINUTES_PER_DAY;
  return diff;
}

function minutesToTime(minutes) {
  minutes = Math.round(minutes / 5) * 5;
  minutes = (minutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const mins = minutes % MINUTES_PER_HOUR;
  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
}

function getUserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function findTimeOffsetChange(startDate, endDate) {
  if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
    throw new Error("Both arguments must be Date objects");
  }
  if (endDate < startDate) {
    throw new Error("End date must be after start date");
  }
  if (!areInDifferentDSTStates(startDate, endDate)) {
    return null;
  }

  let left = new Date(startDate);
  let right = new Date(endDate);

  while (right.getTime() - left.getTime() > HOUR_IN_MS) {
    const mid = new Date((left.getTime() + right.getTime()) / 2);
    if (!areInDifferentDSTStates(startDate, mid)) {
      left = mid;
    } else {
      right = mid;
    }
  }

  const day = new Date(left);
  day.setHours(0, 0, 0, 0);
  let prevOffset = day.getTimezoneOffset();

  for (let minute = -60; minute <= 1440; minute++) {
    const checkTime = new Date(day);
    checkTime.setMinutes(minute, 0, 0);
    const currentOffset = checkTime.getTimezoneOffset();

    if (currentOffset !== prevOffset) {
      const changeTime = new Date(checkTime);
      // Force the timezone offset to be the previous (pre-change) offset.
      changeTime.setMinutes(
        changeTime.getMinutes() + (currentOffset - prevOffset)
      );
      return {
        date: changeTime,
        offsetChange: prevOffset - currentOffset,
      };
    }
    prevOffset = currentOffset;
  }
  return null;
}

function areInDifferentDSTStates(date1, date2) {
  return date1.getTimezoneOffset() !== date2.getTimezoneOffset();
}

function formatTimeOffset(minutes) {
  if (minutes === 60) return "one hour";
  if (minutes === 30) return "half an hour";
  // This shouldn't happen: https://en.wikipedia.org/wiki/Daylight_saving_time_by_country
  return `${minutes} minutes`;
}

class WizardManager {
  constructor(sleepResults) {
    this.sleepResults = sleepResults;
    this.wizard = document.querySelector(".wizard");
    this.wizardList = document.querySelector(".wizard-list");
    this.progressBar = document.querySelector(".progress-bar-fill");
    this.steps = Array.from(document.querySelectorAll(".wizard-step"));
    this.buttons = Array.from(document.querySelectorAll(".step-button"));
    this.sections = Array.from(document.querySelectorAll(".step"));
    this.nextButtons = Array.from(document.querySelectorAll(".next-button"));
    this.prevButtons = Array.from(document.querySelectorAll(".prev-button"));
    this.currentStep = 0;
    this.highestCompletedStep = 0;
    this.initializeEventListeners();
    this.loadState();
    // Show (but don't re-generate) schedule if loading on last step.
    if (this.currentStep === this.steps.length - 1) {
      this.sleepResults.displaySchedule();
    }
    this.updateUI();
  }

  isStepAccessible(stepIndex) {
    if (this.isScheduleGenerated()) {
      return true;
    }
    if (stepIndex <= this.highestCompletedStep) return true;
    if (stepIndex === this.currentStep + 1) return true;
    return false;
  }

  announceStepInaccessible(stepIndex) {
    let message = "Complete previous steps first.";
    if (stepIndex === 3 && !this.isDateSet()) {
      message = "Set a target date in step 3 before first.";
    }
    let announcer = document.getElementById("wizard-error-announcer");
    if (!announcer) {
      announcer = document.createElement("div");
      announcer.id = "wizard-error-announcer";
      announcer.className = "wizard-error-message";
      announcer.setAttribute("aria-live", "polite");
      this.wizard.appendChild(announcer);
    }
    announcer.textContent = message;
    announcer.classList.add("show");
    setTimeout(() => {
      announcer.classList.remove("show");
    }, 3000);
  }

  isScheduleGenerated() {
    const mainState = Storage.get();
    return !!mainState.scheduleData;
  }

  isDateSet() {
    const mainState = Storage.get();
    return !!mainState.targetDate;
  }

  initializeEventListeners() {
    this.buttons.forEach((button, index) => {
      button.addEventListener("click", () => {
        if (this.isStepAccessible(index)) {
          this.goToStep(index);
        } else {
          this.announceStepInaccessible(index);
        }
      });
    });

    this.nextButtons.forEach((button) => {
      button.addEventListener("click", () => this.next());
    });

    this.prevButtons.forEach((button) => {
      button.addEventListener("click", () => this.previous());
    });

    this.wizardList.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          this.next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          this.previous();
          break;
        case "Home":
          e.preventDefault();
          this.goToStep(0);
          break;
        case "End":
          e.preventDefault();
          if (this.isStepAccessible(this.steps.length - 1)) {
            this.goToStep(this.steps.length - 1);
          } else {
            this.announceStepInaccessible(this.steps.length - 1);
          }
          break;
      }
    });
  }

  next() {
    if (this.currentStep < this.steps.length - 1) {
      this.goToStep(this.currentStep + 1);
    }
  }

  previous() {
    if (this.currentStep > 0) {
      this.goToStep(this.currentStep - 1);
    }
  }

  goToStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.steps.length) return;
    if (!this.isStepAccessible(stepIndex)) {
      this.announceStepInaccessible(stepIndex);
      return;
    }
    this.currentStep = stepIndex;
    if (stepIndex > this.highestCompletedStep) {
      this.highestCompletedStep = stepIndex;
    }
    // Generate plan on last step.
    if (stepIndex === this.steps.length - 1) {
      this.sleepResults.updateSchedule();
    }
    this.updateUI();
    this.saveState();
    this.announceStepChange();
  }

  updateUI() {
    this.buttons.forEach((button, index) => {
      button.classList.remove("current", "complete");
      button.removeAttribute("aria-current");
      button.classList.toggle("disabled", !this.isStepAccessible(index));
      button.setAttribute("aria-disabled", !this.isStepAccessible(index));
      if (index === this.currentStep) {
        button.classList.add("current");
        button.setAttribute("aria-current", "step");
      } else if (index < this.currentStep) {
        button.classList.add("complete");
      }
    });
    this.sections.forEach((section, index) => {
      if (index === this.currentStep) {
        section.style.display = "block";
        section.setAttribute("aria-hidden", "false");
      } else {
        section.style.display = "none";
        section.setAttribute("aria-hidden", "true");
      }
    });
    headerLogo.style.display = this.currentStep === 0 ? 'inline-block' : 'none';
    const progress = (this.currentStep / (this.steps.length - 1)) * 100;
    this.progressBar.style.width = `${progress}%`;
  }

  announceStepChange() {
    let liveRegion = document.getElementById("wizard-announcer");
    if (!liveRegion) {
      liveRegion = document.createElement("div");
      liveRegion.id = "wizard-announcer";
      liveRegion.className = "sr-only";
      liveRegion.setAttribute("aria-live", "polite");
      document.body.appendChild(liveRegion);
    }
    const stepLabel =
      this.steps[this.currentStep].querySelector(".step-label").textContent;
    liveRegion.textContent = `Step ${this.currentStep + 1} of ${
      this.steps.length
    }: ${stepLabel}`;
  }

  saveState() {
    localStorage.setItem(
      STORAGE_KEY_WIZARD,
      JSON.stringify({
        currentStep: this.currentStep,
      })
    );
  }

  loadState() {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY_WIZARD);
      const mainState = Storage.get();
      if (mainState.targetDate) {
        this.highestCompletedStep = Math.max(3, this.highestCompletedStep || 0);
      }
      if (savedState) {
        const { currentStep } = JSON.parse(savedState);
        this.currentStep = currentStep;
        this.highestCompletedStep = Math.max(
          currentStep,
          this.highestCompletedStep || 0
        );
      } else {
        this.currentStep = 0;
      }
    } catch (error) {
      console.error("Error loading wizard state:", error);
      this.currentStep = 0;
    }
  }
}

class SleepGoal {
  constructor() {
    this.hoursInput = document.getElementById("goalHours");
    this.minutesInput = document.getElementById("goalMinutes");
    this.observers = [];
    this.debouncedSave = debounce(() => this.saveState(), SAVE_DELAY);
    const validateInput = (input, min, max) => {
      let value = parseInt(input.value);
      if (isNaN(value)) value = min;
      value = Math.max(min, Math.min(max, value));
      input.value = value;
      this.notifyObservers();
    };
    this.hoursInput.addEventListener("change", () =>
      validateInput(this.hoursInput, 4, 12)
    );
    this.minutesInput.addEventListener("change", () =>
      validateInput(this.minutesInput, 0, 55)
    );
    this.loadState();
  }

  addObserver(scheduler) {
    this.observers.push(scheduler);
  }

  notifyObservers() {
    this.observers.forEach((scheduler) => scheduler.updateSleepDuration());
    this.debouncedSave();
  }

  getGoalMinutes() {
    const hours = parseInt(this.hoursInput.value) || 8;
    const minutes = parseInt(this.minutesInput.value) || 0;
    return hours * MINUTES_PER_HOUR + minutes;
  }

  saveState() {
    Storage.save({
      goalHours: parseInt(this.hoursInput.value),
      goalMinutes: parseInt(this.minutesInput.value),
    });
  }

  loadState() {
    const state = Storage.get();
    if (state.goalHours) this.hoursInput.value = state.goalHours;
    if (state.goalMinutes) this.minutesInput.value = state.goalMinutes;
  }
}

class ClockComponent {
  constructor(context) {
    this.context = context;
  }

  createClockStructure() {
    return `
      <div class="time-display">
        <div class="time-section">
          <div class="time-label">
            <span class="icon bed-icon"></span>
            BEDTIME
          </div>
          <input
            type="time"
            class="time-value"
            id="${this.context}SleepTime"
            aria-label="Bedtime"
          />
        </div>
        <div class="time-section">
          <div class="time-label">
            <span class="icon alarm-icon"></span>
            WAKE UP
          </div>
          <input
            type="time"
            class="time-value"
            id="${this.context}WakeTime"
            aria-label="Wake up time"
          />
        </div>
      </div>

      <div class="outer-container" aria-hidden="true">
        <div class="clock-container">
          <div class="clock-face" id="${this.context}ClockFace">
            <div class="symbol stars"><span class="icon stars-icon"></span></div>
            <div class="symbol sun"><span class="icon sun-icon"></span></div>
          </div>
        </div>

        <svg class="arc-layer" viewBox="0 0 0 0">
          <circle class="background-ring" cx="50%" cy="50%" r="42%" fill="none" stroke="currentColor" stroke-width="15%" />
          <path class="sleep-arc" d="" />
          <path class="arc-ticks" d="" />
        </svg>

        <div class="handles-layer">
          <div class="handle sleep" id="${
            this.context
          }SleepHandle"><span class="icon bed-icon"></span></div>
          <div class="handle wake" id="${
            this.context
          }WakeHandle"><span class="icon alarm-icon"></span></div>
        </div>
      </div>

      <div class="sleep-info">
        <div id="${this.context}TotalSleep" class="total-sleep"></div>
        ${
          this.context === "goal"
            ? '<div id="goalGoalStatus" class="goal-status"></div>'
            : ""
        }
      </div>`;
  }

  static inject(container, context) {
    const clockWrapper = container.querySelector(".clock-wrapper");
    const clockComponent = new ClockComponent(context);
    const clockHTML = clockComponent.createClockStructure();
    clockWrapper.insertAdjacentHTML("beforeend", clockHTML);
  }
}

class SleepScheduler {
  constructor(context, sleepGoal) {
    this.context = context;
    const container = document.getElementById(`${context}ScheduleContainer`);
    const baseSize = parseInt(getComputedStyle(container).width);
    this.clockCenter = { x: baseSize * 0.5, y: baseSize * 0.5 };
    this.arcRadius = baseSize * 0.42;
    this.handleRadius = baseSize * 0.055;
    this.tickSpacing = 2.7;
    this.tickLength = baseSize * 0.03;
    this.minSleepHours = 1;
    this.maxSleepHours = 20;
    if (context === "current") {
      this.sleepAngle = this.timeToAngle(2, 15);
      this.wakeAngle = this.timeToAngle(10, 45);
    } else {
      this.sleepAngle = this.timeToAngle(22);
      this.wakeAngle = this.timeToAngle(6, 15);
    }
    this.loadState();
    this.isDraggingArc = false;
    this.isConstraintPushing = false;
    this.isDraggingHandle = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartSleepAngle = 0;
    this.dragStartWakeAngle = 0;
    this.timeChangeListeners = [];
    this.sleepGoal = sleepGoal;
    this.sleepGoal.addObserver(this);
    this.outerContainer = container.querySelector(".outer-container");
    this.sleepHandle = container.querySelector(".handle.sleep");
    this.wakeHandle = container.querySelector(".handle.wake");
    this.sleepTimeDisplay = container.querySelector(`#${context}SleepTime`);
    this.wakeTimeDisplay = container.querySelector(`#${context}WakeTime`);
    this.totalSleepDisplay = container.querySelector(`#${context}TotalSleep`);
    this.goalStatusDisplay =
      context === "goal"
        ? container.querySelector(`#${context}GoalStatus`)
        : null;
    this.container = container;
    this.clockFace = container.querySelector(".clock-face");
    this.arcPath = container.querySelector(".sleep-arc");
    this.ticksPath = container.querySelector(".arc-ticks");
    this.debouncedSave = debounce(() => this.saveState(), SAVE_DELAY);
    this.setupClock();
    this.setupHandles();
    this.setupArcDragging();
    this.updateTimeDisplays();
    this.updateSleepDuration();
    const arcLayer = container.querySelector(".arc-layer");
    arcLayer.setAttribute("viewBox", `0 0 ${baseSize} ${baseSize}`);
    this.sleepTimeDisplay.addEventListener(
      "change",
      this.handleTimeInput.bind(this, false)
    );
    this.wakeTimeDisplay.addEventListener(
      "change",
      this.handleTimeInput.bind(this, true)
    );
  }

  handleTimeInput(isWakeTime, e) {
    const rawMinutes = timeToMinutes(e.target.value);
    const roundedTime = minutesToTime(rawMinutes);
    e.target.value = roundedTime;
    const roundedMinutes = timeToMinutes(roundedTime);
    const newAngle = (roundedMinutes / MINUTES_PER_DAY) * DEGREES_IN_CIRCLE;
    const validAngle = this.getValidAngle(
      newAngle,
      isWakeTime ? this.sleepAngle : this.wakeAngle,
      !isWakeTime
    );
    if (isWakeTime) {
      this.wakeAngle = validAngle;
      this.updateHandlePosition(this.wakeHandle, validAngle);
    } else {
      this.sleepAngle = validAngle;
      this.updateHandlePosition(this.sleepHandle, validAngle);
    }
    if (this.isConstraintPushing) {
      if (isWakeTime) {
        this.sleepTimeDisplay.value = this.angleToTime(this.sleepAngle);
      } else {
        this.wakeTimeDisplay.value = this.angleToTime(this.wakeAngle);
      }
      this.isConstraintPushing = false;
    }
    this.updateArc();
    this.updateSleepDuration();
    this.debouncedSave();
  }

  saveState() {
    Storage.save({
      [`${this.context}SleepAngle`]: this.sleepAngle,
      [`${this.context}WakeAngle`]: this.wakeAngle,
    });
  }

  loadState() {
    const state = Storage.get();
    // Try to load yesterday's schedule if available.
    if (this.context === "current" && state.scheduleData) {
      const yesterday = addDays(new Date().toISOString().split("T")[0], -1);
      const lastNightSchedule = state.scheduleData[yesterday];
      if (lastNightSchedule) {
        const sleepMins = timeToMinutes(lastNightSchedule.bedtime);
        const wakeMins = timeToMinutes(lastNightSchedule.wakeTime);
        this.sleepAngle = sleepMins / 4;
        this.wakeAngle = wakeMins / 4;
        return;
      }
    }
    // Else, load the saved state.
    if (state[`${this.context}SleepAngle`]) {
      this.sleepAngle = state[`${this.context}SleepAngle`];
      this.wakeAngle = state[`${this.context}WakeAngle`];
    }
  }

  timeToAngle(hours, minutes = 0) {
    return hours * DEGREES_PER_HOUR + minutes * DEGREES_PER_MINUTE;
  }

  setupClock() {
    // Add all even numbers.
    for (let hour = 0; hour < 24; hour += 2) {
      const number = document.createElement("div");
      number.className = "number";
      if (hour % 6 === 0) {
        number.className = "number primary"; // Special class for 0,6,12,18.
      }
      number.style.transform = `rotate(${hour * DEGREES_PER_HOUR}deg)`;
      const span = document.createElement("span");
      span.style.display = "block";
      span.style.transform = `rotate(${-hour * DEGREES_PER_HOUR}deg)`;
      span.textContent = hour;
      const baseUnit = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--base-unit"
        )
      );
      span.style.marginTop = `${baseUnit}px`;
      number.appendChild(span);
      this.clockFace.appendChild(number);
    }
    // Add tick marks.
    for (let i = 0; i < 96; i++) {
      const tick = document.createElement("div");
      tick.className = i % 4 === 0 ? "tick hour" : "tick";
      tick.style.transform = `rotate(${i * 3.75}deg)`;
      this.clockFace.appendChild(tick);
    }
  }

  setupHandles() {
    this.updateHandlePosition(this.sleepHandle, this.sleepAngle);
    this.updateHandlePosition(this.wakeHandle, this.wakeAngle);
    this.makeHandleDraggable(this.sleepHandle, (angle) => {
      const validAngle = this.getValidAngle(angle, this.wakeAngle, true);
      if (validAngle !== null) {
        this.sleepAngle = validAngle;
        this.updateArc();
        this.updateTimeDisplays();
      }
    });
    this.makeHandleDraggable(this.wakeHandle, (angle) => {
      const validAngle = this.getValidAngle(angle, this.sleepAngle, false);
      if (validAngle !== null) {
        this.wakeAngle = validAngle;
        this.updateArc();
        this.updateTimeDisplays();
      }
    });
    this.updateArc();
  }

  setupArcDragging() {
    const startArcDrag = (e) => {
      // If it's a multi-touch event, don't drag.
      if (e.touches && e.touches.length > 1) return;
      this.isDraggingArc = true;
      this.arcPath.style.cursor = "grabbing";
      const rect = this.outerContainer.getBoundingClientRect();
      this.dragStartX = (e.clientX || e.touches?.[0].clientX) - rect.left;
      this.dragStartY = (e.clientY || e.touches?.[0].clientY) - rect.top;
      this.dragStartSleepAngle = this.sleepAngle;
      this.dragStartWakeAngle = this.wakeAngle;
      e.preventDefault();
    };

    const dragArc = (e) => {
      if (!this.isDraggingArc) return;
      const rect = this.outerContainer.getBoundingClientRect();
      const currentX = (e.clientX || e.touches?.[0].clientX) - rect.left;
      const currentY = (e.clientY || e.touches?.[0].clientY) - rect.top;
      // Calculate the angle change based on the movement relative to the center
      const startAngle = Math.atan2(
        this.dragStartY - this.clockCenter.y,
        this.dragStartX - this.clockCenter.x
      );
      const currentAngle = Math.atan2(
        currentY - this.clockCenter.y,
        currentX - this.clockCenter.x
      );

      // Convert angle difference to degrees and ensure it's properly normalized
      let angleDiff = this.normalizeAngle(
        ((currentAngle - startAngle) * DEGREES_IN_HALF_CIRCLE) / Math.PI
      );
      if (angleDiff > DEGREES_IN_HALF_CIRCLE) angleDiff -= 360;

      // Round
      angleDiff = Math.round(angleDiff / SNAP_TO_DEGREES) * SNAP_TO_DEGREES;

      // Update both angles while maintaining the original separation
      this.sleepAngle = this.normalizeAngle(
        this.dragStartSleepAngle + angleDiff
      );
      this.wakeAngle = this.normalizeAngle(this.dragStartWakeAngle + angleDiff);

      // Update positions and displays
      this.updateHandlePosition(this.sleepHandle, this.sleepAngle);
      this.updateHandlePosition(this.wakeHandle, this.wakeAngle);
      this.updateArc();
      this.updateTimeDisplays();
    };

    const stopArcDrag = () => {
      this.isDraggingArc = false;
      this.arcPath.style.cursor = "grab";
    };

    this.arcPath.style.cursor = "grab";
    this.arcPath.addEventListener("mousedown", startArcDrag);
    this.arcPath.addEventListener("touchstart", startArcDrag, {
      passive: false,
    });
    document.addEventListener("mousemove", dragArc, {
      passive: true,
    });
    document.addEventListener("touchmove", dragArc, {
      passive: true,
    });
    document.addEventListener("mouseup", stopArcDrag, {
      passive: true,
    });
    document.addEventListener("touchend", stopArcDrag, {
      passive: true,
    });
  }

  validateTimeChange(newTime, isStartTime) {
    const newMinutes = timeToMinutes(newTime);
    let newAngle = (newMinutes / MINUTES_PER_DAY) * DEGREES_IN_CIRCLE;
    const validAngle = this.getValidAngle(
      newAngle,
      isStartTime ? this.wakeAngle : this.sleepAngle,
      isStartTime
    );
    if (this.isConstraintPushing) {
      if (isStartTime) {
        this.wakeTimeDisplay.value = this.angleToTime(this.wakeAngle);
      } else {
        this.sleepTimeDisplay.value = this.angleToTime(this.sleepAngle);
      }
      this.isConstraintPushing = false;
    }
    return this.angleToTime(validAngle);
  }

  getValidAngle(newAngle, otherAngle, isSleepHandle) {
    // Snap to intervals and normalize angles
    newAngle = Math.round(newAngle / SNAP_TO_DEGREES) * SNAP_TO_DEGREES;
    newAngle = this.normalizeAngle(newAngle);
    otherAngle = this.normalizeAngle(otherAngle);
    // Calculate minimum and maximum allowed differences
    const minDiff = this.minSleepHours * DEGREES_PER_HOUR;
    const maxDiff = this.maxSleepHours * DEGREES_PER_HOUR;
    // Calculate the angular difference based on which handle is moving
    let diff = isSleepHandle
      ? this.normalizeAngle(otherAngle - newAngle)
      : this.normalizeAngle(newAngle - this.sleepAngle);
    // Handle constraint violations
    if (diff < minDiff || diff > maxDiff) {
      this.isConstraintPushing = true;
      const adjustment = diff < minDiff ? minDiff : maxDiff;

      if (isSleepHandle) {
        this.wakeAngle = this.normalizeAngle(newAngle + adjustment);
        this.updateHandlePosition(this.wakeHandle, this.wakeAngle);
      } else {
        this.sleepAngle = this.normalizeAngle(newAngle - adjustment);
        this.updateHandlePosition(this.sleepHandle, this.sleepAngle);
      }
    }

    return newAngle;
  }

  normalizeAngle(angle) {
    return (
      ((angle % DEGREES_IN_CIRCLE) + DEGREES_IN_CIRCLE) % DEGREES_IN_CIRCLE
    );
  }

  angleToRadians(angle) {
    return ((angle - DEGREES_90) * Math.PI) / DEGREES_IN_HALF_CIRCLE;
  }

  makeHandleDraggable(handle, onDrag) {
    let isDragging = false;

    const startDrag = (e) => {
      // If it's a multi-touch event, don't drag.
      if (e.touches && e.touches.length > 1) {
        initialTouchDistance = getTouchDistance(e);
        return;
      }
      isDragging = true;
      this.isDraggingHandle = true;
      handle.classList.add("dragging");
      if (!e.touches || e.touches.length === 1) {
        e.preventDefault();
      }
      e.stopPropagation();
      // Get initial position
      const touch = e.touches ? e.touches[0] : e;
      const rect = this.outerContainer.getBoundingClientRect();
      const x = touch.clientX - rect.left - this.clockCenter.x;
      const y = touch.clientY - rect.top - this.clockCenter.y;
      // Calculate initial angle
      let angle = this.normalizeAngle(
        (Math.atan2(y, x) * DEGREES_IN_HALF_CIRCLE) / Math.PI + DEGREES_90
      );
      if (angle < 0) angle += 360;
      this.updateHandlePosition(handle, angle);
      onDrag(angle);
    };

    const drag = (e) => {
      // Multi-touch event during drag; user may be trying to zoom.
      if (e.touches && e.touches.length > 1) {
        isDragging = false;
        this.isDraggingHandle = false;
        handle.classList.remove("dragging");
        return;
      }
      if (!isDragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const rect = this.outerContainer.getBoundingClientRect();
      const x = touch.clientX - rect.left - this.clockCenter.x;
      const y = touch.clientY - rect.top - this.clockCenter.y;
      let angle = this.normalizeAngle(
        (Math.atan2(y, x) * DEGREES_IN_HALF_CIRCLE) / Math.PI + DEGREES_90
      );
      if (angle < 0) angle += 360;
      this.updateHandlePosition(handle, angle);
      onDrag(angle);
      this.updateSleepDuration();
    };
    const stopDrag = () => {
      isDragging = false;
      this.isDraggingHandle = false;
      this.isConstraintPushing = false;
      handle.classList.remove("dragging");
      this.updateArc();
    };
    handle.addEventListener("mousedown", startDrag);
    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", stopDrag);
    handle.addEventListener("touchstart", (e) => startDrag(e), {
      passive: false,
    });
    document.addEventListener("touchmove", (e) => drag(e), {
      passive: true,
    });
    document.addEventListener("touchend", stopDrag, { passive: true });
    document.addEventListener("touchcancel", stopDrag, {
      passive: true,
    });
  }

  updateHandlePosition(handle, angle) {
    const radians = this.angleToRadians(angle);
    const x = this.clockCenter.x + this.arcRadius * Math.cos(radians);
    const y = this.clockCenter.y + this.arcRadius * Math.sin(radians);
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;
  }

  setupGoalInputs() {
    const validateInput = (input, min, max) => {
      let value = parseInt(input.value);
      if (isNaN(value)) value = min;
      value = Math.max(min, Math.min(max, value));
      input.value = value;
      this.updateSleepDuration();
    };
    this.goalHoursInput.addEventListener("change", () =>
      validateInput(this.goalHoursInput, 4, 12)
    );
    this.goalMinutesInput.addEventListener("change", () =>
      validateInput(this.goalMinutesInput, 0, 50)
    );
  }

  getSleepGoalMinutes() {
    return this.sleepGoal.getGoalMinutes();
  }

  updateSleepDuration() {
    let diff = this.normalizeAngle(this.wakeAngle - this.sleepAngle);
    const hours = Math.floor(diff / DEGREES_PER_HOUR);
    const minutes = Math.round((diff % DEGREES_PER_HOUR) * MINUTES_TO_ANGLE);
    const totalSleepElement = this.totalSleepDisplay;
    totalSleepElement.textContent =
      minutes === 0
        ? `${hours}${HOUR_SUFFIX}`
        : `${hours}${HOUR_MIN_FORMAT}${minutes}${MIN_SUFFIX}`;
    if (this.goalStatusDisplay) {
      const totalMinutes = hours * MINUTES_PER_HOUR + minutes;
      const goalMinutes = this.getSleepGoalMinutes();
      if (totalMinutes >= goalMinutes) {
        this.goalStatusDisplay.innerHTML = GOAL_MET_MESSAGE;
        this.container.classList.remove(WARNING_CLASS);
      } else {
        this.goalStatusDisplay.innerHTML = GOAL_NOT_MET_MESSAGE;
        this.container.classList.add(WARNING_CLASS);
      }
    }
  }

  updateArc() {
    let startAngle = this.sleepAngle;
    let endAngle = this.wakeAngle;
    if (endAngle < startAngle) endAngle += 360;
    this.arcPath.setAttribute("d", this.createArcPath(startAngle, endAngle));
    const ticksPathData = this.getTicksPath(
      startAngle,
      endAngle,
      this.arcRadius
    );
    this.ticksPath.setAttribute("d", ticksPathData);
  }

  createArcPath(startAngle, endAngle) {
    const outerRadius = this.arcRadius + this.handleRadius;
    const innerRadius = this.arcRadius - this.handleRadius;
    const startOuter = this.getPointOnCircle(startAngle, outerRadius);
    const endOuter = this.getPointOnCircle(endAngle, outerRadius);
    const startInner = this.getPointOnCircle(startAngle, innerRadius);
    const endInner = this.getPointOnCircle(endAngle, innerRadius);
    const largeArc = endAngle - startAngle <= DEGREES_IN_HALF_CIRCLE ? 0 : 1;
    return `
        M ${startOuter.x} ${startOuter.y}
        A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}
        A ${this.handleRadius} ${this.handleRadius} 0 0 1 ${endInner.x} ${endInner.y}
        A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}
        A ${this.handleRadius} ${this.handleRadius} 0 0 1 ${startOuter.x} ${startOuter.y}
        Z`;
  }

  getTicksPath(startAngle, endAngle, radius) {
    const halfTickLength = this.tickLength / 2;
    let ticks = "";
    const firstTick =
      this.isDraggingArc || (this.isDraggingHandle && this.isConstraintPushing)
        ? startAngle
        : Math.ceil(startAngle / this.tickSpacing) * this.tickSpacing;

    for (let angle = firstTick; angle <= endAngle; angle += this.tickSpacing) {
      const normalizedAngle = angle % DEGREES_IN_CIRCLE;
      const outer = this.getPointOnCircle(
        normalizedAngle,
        radius + halfTickLength
      );
      const inner = this.getPointOnCircle(
        normalizedAngle,
        radius - halfTickLength
      );
      ticks += `M ${outer.x} ${outer.y} L ${inner.x} ${inner.y} `;
    }
    return ticks;
  }

  getPointOnCircle(angle, radius) {
    const radians = this.angleToRadians(angle);
    return {
      x: this.clockCenter.x + radius * Math.cos(radians),
      y: this.clockCenter.y + radius * Math.sin(radians),
    };
  }

  angleToTime(angle) {
    const { hours, minutes } = this.getHoursAndMinutes(angle);
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  }

  getHoursAndMinutes(angle) {
    const hours = Math.floor(angle / DEGREES_PER_HOUR);
    const minutes = Math.round((angle % DEGREES_PER_HOUR) * MINUTES_TO_ANGLE);
    return this.normalizeTime(hours, minutes);
  }

  normalizeTime(hours, minutes) {
    if (minutes === MINUTES_PER_HOUR) {
      return { hours: (hours + 1) % 24, minutes: 0 };
    }
    return { hours: hours === 24 ? 0 : hours, minutes };
  }

  updateTimeDisplays() {
    this.sleepTimeDisplay.value = this.angleToTime(this.sleepAngle);
    this.wakeTimeDisplay.value = this.angleToTime(this.wakeAngle);
    this.notifyTimeChange();
    this.debouncedSave();
  }

  addTimeChangeListener(callback) {
    this.timeChangeListeners.push(callback);
  }

  notifyTimeChange() {
    this.timeChangeListeners.forEach((callback) => callback());
  }
}

class DatePicker {
  constructor(currentScheduler, goalScheduler) {
    this.dateInput = document.getElementById("targetDate");
    this.scheduleTip = document.getElementById("scheduleTip");
    this.helpSection = document.getElementById("datePickerHelp");
    this.currentScheduler = currentScheduler;
    this.goalScheduler = goalScheduler;
    this.debouncedSave = debounce(() => this.saveState(), SAVE_DELAY);
    this.loadState();
    this.initializeDatePicker();
    if (!this.dateInput.value) {
      this.showRecommendedDate();
    }
    this.updateRecommendationText();
    this.addEventListeners();
  }

  initializeDatePicker() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.dateInput.min = this.formatDate(tomorrow);
  }

  showRecommendedDate() {
    const { recommendedDate } = this.calculateRecommendedDate();
    this.dateInput.value = this.formatDate(recommendedDate);
    this.debouncedSave();
  }

  handleDateChange(e) {
    this.debouncedSave();
    this.updateRecommendationText();
  }

  handleScheduleChange() {
    this.showRecommendedDate();
    this.updateRecommendationText();
  }

  updateRecommendationText() {
    const { message, shouldHideHelp, minutesPerDay } =
      this.calculateScheduleAdjustment();
    this.scheduleTip.textContent = message;
    this.helpSection.style.display = shouldHideHelp ? "none" : "block";
    if (!calendarAdjustmentMessage) return;

    let msg = minutesPerDay ? DATE_ADJUSTMENT_MESSAGE(minutesPerDay) : "";

    if (dstChange) {
      const action =
        dstChange.offsetChange > 0 ? "spring forward" : "fall back";
      const dateStr = dstChange.date.toLocaleDateString(navigator.language, {
        month: "long",
        day: "numeric",
      });
      msg += `<p>Note: Clocks will ${action} by ${formatTimeOffset(
        Math.abs(dstChange.offsetChange)
      )} on ${dateStr}.<br>Your schedule will be automatically adjusted.</p>`;
    }
    calendarAdjustmentMessage.innerHTML = msg;
    const container = document.querySelector(".container.target-date");
    container.classList.toggle(
      "warning",
      minutesPerDay > MAX_MINUTES_PER_DAY_RECOMMENDED
    );
  }

  calculateScheduleAdjustment() {
    const { totalDiff, minDays, maxDays } = this.calculateRecommendedDate();
    const today = new Date();
    dstChange = findTimeOffsetChange(today, this.getSelectedDate());

    if (totalDiff === 0 && !dstChange) {
      return {
        message: "Your schedules already match!",
        minutesPerDay: 0,
      };
    }

    if (totalDiff === 0 && dstChange) {
      return {
        message: "Your schedules match, but there will be a time change.",
        minutesPerDay: 0,
      };
    }
    const minAdjustDate = new Date(today);
    const maxAdjustDate = new Date(today);
    minAdjustDate.setDate(today.getDate() + minDays);
    maxAdjustDate.setDate(today.getDate() + maxDays);

    const formatDateOption = { month: "short", day: "numeric" };
    const minDateStr = minAdjustDate.toLocaleDateString(
      navigator.language || navigator.userLanguage,
      formatDateOption
    );
    const maxDateStr = maxAdjustDate.toLocaleDateString(
      navigator.language || navigator.userLanguage,
      formatDateOption
    );

    const recommendationMsg =
      RECOMMENDATION_HOURS_PREFIX +
      (minDays === maxDays
        ? `aim for ${minDateStr}`
        : `aim for ${minDateStr} — ${maxDateStr}`);

    const daysUntilTarget = this.getDaysUntilTarget();
    const minutesPerDay = Math.ceil(totalDiff / daysUntilTarget);

    return {
      message: recommendationMsg,
      shouldHideHelp: false,
      minutesPerDay,
    };
  }

  calculateRecommendedDate() {
    const sleepDiff = this.calculateTimeDiff(
      this.currentScheduler.sleepAngle,
      this.goalScheduler.sleepAngle
    );
    const wakeDiff = this.calculateTimeDiff(
      this.currentScheduler.wakeAngle,
      this.goalScheduler.wakeAngle
    );
    const totalDiff = Math.max(sleepDiff, wakeDiff);
    if (totalDiff === 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return {
        totalDiff,
        minDays: 1,
        maxDays: 1,
        recommendedDate: tomorrow,
      };
    }
    const today = new Date();
    const minDays = Math.ceil(totalDiff / MAX_MINUTES_PER_DAY_RECOMMENDED);
    const maxDays = Math.ceil(totalDiff / MIN_MINUTES_PER_DAY_RECOMMENDED);
    const recommendedDays = Math.ceil(
      totalDiff / MIN_MINUTES_PER_DAY_RECOMMENDED
    );
    const recommendedDate = new Date(today);
    recommendedDate.setDate(today.getDate() + recommendedDays);
    return {
      totalDiff,
      minDays,
      maxDays,
      recommendedDate,
    };
  }

  addEventListeners() {
    this.goalScheduler.addTimeChangeListener(() => this.handleScheduleChange());
    this.currentScheduler.addTimeChangeListener(() =>
      this.handleScheduleChange()
    );
    this.dateInput.addEventListener("change", (e) =>
      this.handleDateChange(e)
    );
    this.dateInput.addEventListener("input", (e) => this.validateDate(e));
  }

  isValidDate(dateString) {
    const selectedDate = new Date(dateString);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return selectedDate >= tomorrow;
  }

  validateDate(event) {
    if (!this.isValidDate(event.target.value)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      this.dateInput.value = this.formatDate(tomorrow);
      this.showFeedback("Select a future date");
    }
  }

  getScheduleMinutes(scheduler) {
    const sleepMin = this.normalizeMinutes(scheduler.sleepAngle);
    const wakeMin = this.normalizeMinutes(scheduler.wakeAngle);
    return { sleepMin, wakeMin };
  }

  normalizeMinutes(angle) {
    return (angle / 15) * 60; // Convert from angle to minutes.
  }

  calculateTimeDiff(currentAngle, targetAngle) {
    // Convert angles to minutes since midnight
    let currentMins = (currentAngle / DEGREES_IN_CIRCLE) * (24 * 60);
    let targetMins = (targetAngle / DEGREES_IN_CIRCLE) * (24 * 60);
    // Calculate absolute difference
    let diff = Math.abs(targetMins - currentMins);
    // If difference is more than 12 hours, use the shorter path around the clock
    if (diff > 12 * 60) {
      diff = 24 * 60 - diff;
    }
    return Math.round(diff);
  }

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  showFeedback(message) {
    let feedback = document.querySelector(".date-feedback");
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.className = "date-feedback";
      this.dateInput.parentElement.appendChild(feedback);
    }
    feedback.textContent = message;
    feedback.classList.add("show");
    setTimeout(() => {
      feedback.classList.remove("show");
    }, 3000);
  }

  getSelectedDate() {
    return new Date(this.dateInput.value);
  }

  getDaysUntilTarget() {
    const today = new Date();
    const targetDate = this.getSelectedDate();
    const diffTime = Math.abs(targetDate - today);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  saveState() {
    Storage.save({
      targetDate: this.dateInput.value,
    });
  }

  loadState() {
    const state = Storage.get();
    if (state.targetDate) {
      this.dateInput.value = state.targetDate;
    }
  }
}

class SleepScheduleResults {
  constructor(currentScheduler, goalScheduler, datePicker) {
    this.currentScheduler = currentScheduler;
    this.goalScheduler = goalScheduler;
    this.datePicker = datePicker;
    this.setupDownloadButton();
  }

  addDays(dateString, days) {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);
    return date.toISOString().split("T")[0];
  }

  getPreviousDay(dateString) {
    return addDays(dateString, -1);
  }

  updateSchedule() {
    // Get target times and normalize for DST comparison.
    const dstOffset = dstChange ? dstChange.offsetChange : 0;
    const currentSleep = this.currentScheduler.angleToTime(
      this.currentScheduler.sleepAngle
    );
    const currentWake = this.currentScheduler.angleToTime(
      this.currentScheduler.wakeAngle
    );
    const targetSleep = this.goalScheduler.angleToTime(
      this.goalScheduler.sleepAngle
    );
    const targetWake = this.goalScheduler.angleToTime(
      this.goalScheduler.wakeAngle
    );
    const totalDays = this.datePicker.getDaysUntilTarget();
    // Calculate required adjustments considering DST offset.
    const currentSleepMins = timeToMinutes(currentSleep);
    const currentWakeMins = timeToMinutes(currentWake);
    const targetSleepMins = timeToMinutes(targetSleep) - dstOffset;
    const targetWakeMins = timeToMinutes(targetWake) - dstOffset;
    // Normalize time differences to use shortest path around clock.
    let sleepAdjustment = targetSleepMins - currentSleepMins;
    let wakeAdjustment = targetWakeMins - currentWakeMins;
    if (sleepAdjustment > MINUTES_PER_HALF_DAY)
      sleepAdjustment -= MINUTES_PER_DAY;
    if (sleepAdjustment < -MINUTES_PER_HALF_DAY)
      sleepAdjustment += MINUTES_PER_DAY;
    if (wakeAdjustment > MINUTES_PER_HALF_DAY)
      wakeAdjustment -= MINUTES_PER_DAY;
    if (wakeAdjustment < -MINUTES_PER_HALF_DAY)
      wakeAdjustment += MINUTES_PER_DAY;

    const scheduleData = {};
    let sleepProgress = 0;
    let wakeProgress = 0;
    let hasDSTOccurred = false;
    let localDSTOffset = 0;
    const today = new Date().toISOString().split("T")[0];
    const movingLater = sleepAdjustment > 0;
    let previousCrossedMidnight = null;
    let dateAdjustment = 0;
    let isTransitionDay = false;

    // Has first bedtime passed? Avoids suggesting an impossible "tonight" schedule.
    const now = new Date();
    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
    const firstBedMinutes = adjustMinutes(
      currentSleepMins,
      Math.round(sleepAdjustment / totalDays / 5) * 5
    );
    const skipFirstDay = firstBedMinutes < currentTimeMinutes;
    scheduleData[this.getPreviousDay(today)] = {
      bedtime: currentSleep,
      wakeTime: currentWake,
    };
    // Generate daily schedule.
    for (let day = skipFirstDay ? 1 : 0; day <= totalDays; day++) {
      sleepProgress += sleepAdjustment / totalDays;
      wakeProgress += wakeAdjustment / totalDays;
      const roundedSleepAdjust = Math.round(sleepProgress / 5) * 5;
      const roundedWakeAdjust = Math.round(wakeProgress / 5) * 5;
      let bedMinutes = adjustMinutes(currentSleepMins, roundedSleepAdjust);
      let wakeMinutes = adjustMinutes(currentWakeMins, roundedWakeAdjust);
      // Determine if this schedule crosses midnight.
      const crossesMidnight = wakeMinutes < bedMinutes;
      // Detect transition day for early key.
      isTransitionDay =
        previousCrossedMidnight !== null &&
        !movingLater &&
        !previousCrossedMidnight &&
        crossesMidnight;
      // Adjust date based on midnight crossing transitions.
      if (previousCrossedMidnight !== null) {
        if (movingLater && previousCrossedMidnight && !crossesMidnight) {
          dateAdjustment++; // Skip a day when moving later and transitioning to non-crossing.
        } else if (
          !movingLater &&
          !previousCrossedMidnight &&
          crossesMidnight
        ) {
          dateAdjustment--; // Repeat a day when moving earlier and transitioning to crossing.
        }
      }
      const currentDate = addDays(today, day + dateAdjustment);
      // Check for DST change during sleep period.
      const bedDateTime = new Date(currentDate);
      bedDateTime.setHours(Math.floor(bedMinutes / 60), bedMinutes % 60);
      const wakeDateTime = new Date(currentDate);
      if (crossesMidnight) wakeDateTime.setDate(wakeDateTime.getDate() + 1);
      wakeDateTime.setHours(Math.floor(wakeMinutes / 60), wakeMinutes % 60);
      const dstChangeInfo = findTimeOffsetChange(bedDateTime, wakeDateTime);
      if (dstChangeInfo) {
        hasDSTOccurred = true;
        localDSTOffset = dstChangeInfo.offsetChange;
      } else if (dstChange && bedDateTime >= dstChange.date) {
        hasDSTOccurred = true;
        localDSTOffset = dstChange.offsetChange;
      }
      // Adjust times for DST if it has already occurred.
      if (hasDSTOccurred && !dstChangeInfo) {
        bedMinutes = adjustMinutes(bedMinutes, localDSTOffset);
        wakeMinutes = adjustMinutes(wakeMinutes, localDSTOffset);
      }
      const scheduleKey = isTransitionDay
        ? `${currentDate}-early`
        : currentDate;
      scheduleData[scheduleKey] = {
        bedtime: minutesToTime(bedMinutes),
        wakeTime: minutesToTime(wakeMinutes),
        dstChange: dstChangeInfo ? true : null,
      };
      previousCrossedMidnight = crossesMidnight;
    }
    Storage.save({ scheduleData });
    this.displaySchedule();
  }

  displaySchedule() {
    document.querySelector(".results").style.display = "block";
    const lastNightSection = document.getElementById("lastNightSchedule");
    const tonightSection = document.getElementById("tonightSchedule");
    const upcomingSection = document.getElementById("upcomingSchedule");
    const savedState = Storage.get();
    const scheduleData = savedState.scheduleData;
    if (!scheduleData) {
      return;
    }

    const targetDate = savedState.targetDate;
    // Get first two dates (last night + upcoming).
    const sortedDates = Object.keys(scheduleData).sort((a, b) =>
      a.localeCompare(b)
    );
    const [firstDate, secondDate] = sortedDates;
    if (!firstDate || !secondDate) return;
    lastNightSection.innerHTML = this.createScheduleCard(
      "Last night",
      scheduleData[firstDate].bedtime,
      scheduleData[firstDate].wakeTime,
      false,
      firstDate
    );

    tonightSection.innerHTML = this.createScheduleCard(
      "Upcoming",
      scheduleData[secondDate].bedtime,
      scheduleData[secondDate].wakeTime,
      true,
      secondDate
    );

    const upcoming = Object.entries(scheduleData)
      .filter(([date]) => date > secondDate && date <= targetDate)
      .map(([date, schedule]) => ({ date, ...schedule }))
      .sort((a, b) => a.date.localeCompare(b.date));

    upcomingSection.innerHTML = upcoming
      .map((day) =>
        this.createScheduleCard(
          this.formatDate(day.date),
          day.bedtime,
          day.wakeTime,
          false,
          day.date
        )
      )
      .join("");

    const hasDoubleSchedule = Object.keys(scheduleData).some((date) =>
      date.endsWith("-early")
    );
    const scheduleHelp = document.getElementById("scheduleHelp");
    if (hasDoubleSchedule) {
      scheduleHelp.textContent =
        "Note: dates refer to bedtime. As your schedule adjusts, one date might show two different sleep periods.";
    } else {
      scheduleHelp.textContent =
        "Tip: visit this page daily to see your updated schedule.";
    }
  }

  createScheduleCard(label, bedtime, wakeTime, isHighlight = false, date) {
    const sleep = this.calculateSleepDuration(bedtime, wakeTime);
    const savedState = Storage.get();
    const scheduleData = savedState.scheduleData;
    const daySchedule = scheduleData[date];
    let displayWakeTime = wakeTime;
    let iconSpan = "";
    let cardClass = "schedule-card";
    let timezoneIndicator = "";
    if (isHighlight) cardClass += " highlight";
    if (dstChange) {
      const scheduleDate = new Date(date.replace("-early", ""));
      const changeDate = new Date(dstChange.date);
      const isTransitionDay =
        scheduleDate.toDateString() === changeDate.toDateString();
      let timeState;
      if (isTransitionDay) {
        const bedDateTime = new Date(scheduleDate);
        const { hours, minutes } = parseTime(bedtime);
        bedDateTime.setHours(hours, minutes, 0, 0);

        // If we're springing forward, before change = ST, after = DST
        // If we're falling back, before change = DST, after = ST
        timeState =
          bedDateTime < changeDate
            ? dstChange.offsetChange < 0 // Before change: DST if falling back
            : dstChange.offsetChange > 0; // After change: DST if springing forward
      } else {
        // For any other day, just compare dates
        // If we're springing forward: before change = ST, after = DST
        // If we're falling back: before change = DST, after = ST
        timeState =
          scheduleDate < changeDate
            ? dstChange.offsetChange < 0 // Before change: DST if falling back
            : dstChange.offsetChange > 0; // After change: DST if springing forward
      }

      cardClass += timeState ? " dst" : " standard-time";
      const ST = "Standard Time";
      const DST = "Daylight Saving Time";
      const TIMES_IN = "Both times are in";

      let indicatorText, tooltipText;
      if (daySchedule?.dstChange) {
        const springForward = dstChange.offsetChange > 0;
        cardClass += springForward ? " spring-forward" : " fall-back";
        const fromZone = springForward ? ST : DST;
        const toZone = springForward ? DST : ST;

        indicatorText = springForward ? "ST → DST" : "DST → ST";
        tooltipText = `Bedtime is in ${fromZone}.<br>Wake time is in ${toZone}`;
      } else {
        indicatorText = timeState ? "DST" : "ST";
        tooltipText = `${TIMES_IN} ${timeState ? DST : ST}`;
      }
      tooltipText += ".";

      timezoneIndicator = `
            <div class="timezone-indicator"
                 role="tooltip"
                 aria-label="${tooltipText}">
                ${indicatorText}
            </div>
            <div class="info-popup">${tooltipText}</div>`;
    }

    if (daySchedule?.dstChange) {
      cardClass += " dst-change";
      const adjustedWakeMinutes = adjustMinutes(
        timeToMinutes(wakeTime),
        dstChange.offsetChange
      );
      displayWakeTime = minutesToTime(adjustedWakeMinutes);
      const offsetMs =
        dstChange.offsetChange < 0
          ? Math.abs(dstChange.offsetChange) * MINUTE_IN_MS
          : 0;
      const beforeChange = new Date(
        dstChange.date.getTime() - offsetMs - MINUTE_IN_MS
      );
      const afterChange = new Date(dstChange.date);
      const formatTime = (hours, minutes) =>
        `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}`;
      const lastTime = formatTime(
        beforeChange.getHours(),
        beforeChange.getMinutes()
      );

      let firstTime;
      if (dstChange.offsetChange < 0) {
        // When falling back, use same hour with calculated minutes for partial-hour transitions.
        firstTime = formatTime(
          beforeChange.getHours(),
          Math.abs(dstChange.offsetChange) % MINUTES_PER_HOUR
        );
      } else {
        // When springing forward, include any partial-hour offset in final time.
        firstTime = formatTime(
          afterChange.getHours(),
          dstChange.offsetChange % MINUTES_PER_HOUR
        );
      }
      const action = dstChange.offsetChange > 0 ? "jump" : "fall back";
      const dstInfo =
        `While you sleep, clocks will ${action} from ${lastTime} to ${firstTime}.<br>` +
        `Wake up time is adjusted for this change.`;

      iconSpan = `<span class="icon clock-shift-icon${
        dstChange.offsetChange > 0 ? " horizontal-flip" : ""
      }"></span>
        <div class="info-popup">${dstInfo}</div>`;
    }

    return `
    <div class="${cardClass}">
        ${timezoneIndicator}
        <div class="date">
            ${label} ${iconSpan}
        </div>
        <div class="time-display">
            <div class="bed-time">
                <span class="icon bed-icon"></span>
                ${bedtime}
            </div>
            <div class="wake-time">
                <span class="icon alarm-icon"></span>
                ${displayWakeTime}
            </div>
        </div>
        <div class="total-sleep">${sleep}</div>
    </div>
    `;
  }

  calculateSleepDuration(bedtime, wakeTime) {
    let bedMinutes = timeToMinutes(bedtime);
    let wakeMinutes = timeToMinutes(wakeTime);
    if (wakeMinutes < bedMinutes) {
      wakeMinutes += 24 * 60;
    }
    const totalMinutes = wakeMinutes - bedMinutes;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
  }

  formatDate(dateString) {
    // In case we have two cards for one date.
    const cleanDateString = dateString.replace(/-early$/, "");
    const date = new Date(cleanDateString);
    return date.toLocaleDateString(getUserLocale(), {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
  }

  setupDownloadButton() {
    const downloadButton = document.getElementById("downloadCalendarButton");
    downloadButton.addEventListener("click", () => {
      const savedState = Storage.get();
      if (savedState.scheduleData) {
        downloadCalendar(savedState.scheduleData);
      }
    });
  }
}

function generateCalendar(scheduleData) {
  if (!scheduleData || Object.keys(scheduleData).length === 0) {
    throw new Error("No schedule data provided");
  }
  const timezone = getUserTimezone();
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${CALENDAR_MESSAGES.CALENDAR_PRODUCER}`,
    "CALSCALE:GREGORIAN",
    generateTimezoneBlock(),
    ...generateEvents(scheduleData, timezone),
    "END:VCALENDAR",
  ].join(CALENDAR_CONSTANTS.LINE_ENDING);
}

function generateEvents(scheduleData, timezone) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Object.entries(scheduleData)
    .filter(([date]) => new Date(date.replace(/-early$/, "")) >= today)
    .flatMap(([date, schedule]) => {
      if (!schedule?.bedtime || !schedule?.wakeTime) {
        console.error("Invalid schedule for date:", date);
        return [];
      }

      let displayWakeTime = schedule.wakeTime;
      if (schedule.dstChange) {
        const adjustedWakeMinutes = adjustMinutes(
          timeToMinutes(schedule.wakeTime),
          dstChange.offsetChange
        );
        displayWakeTime = minutesToTime(adjustedWakeMinutes);
      }

      let description = CALENDAR_MESSAGES.EVENT_DESCRIPTION(
        schedule.bedtime,
        displayWakeTime
      );

      if (schedule.dstChange) {
        const offsetMs =
          dstChange.offsetChange < 0
            ? Math.abs(dstChange.offsetChange) * MINUTE_IN_MS
            : 0;
        const beforeChange = new Date(
          dstChange.date.getTime() - offsetMs - MINUTE_IN_MS
        );
        const afterChange = new Date(dstChange.date);
        const formatTime = (hours, minutes) =>
          `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}`;
        const lastTime = formatTime(
          beforeChange.getHours(),
          beforeChange.getMinutes()
        );

        let firstTime;
        if (dstChange.offsetChange < 0) {
          firstTime = formatTime(
            beforeChange.getHours(),
            Math.abs(dstChange.offsetChange) % MINUTES_PER_HOUR
          );
        } else {
          firstTime = formatTime(
            afterChange.getHours(),
            dstChange.offsetChange % MINUTES_PER_HOUR
          );
        }
        const action = dstChange.offsetChange > 0 ? "jump" : "fall back";
        description += `\n\n⚠️ While you sleep, clocks will ${action} from ${lastTime} to ${firstTime}.\nWake up time is adjusted for this change.`;
      }

      description += `\n\nGenerated by ${APP_URL}`;

      const cleanDate = date.replace(/-early$/, "");
      const reminderTime = calculateReminderTime(cleanDate, schedule.bedtime);
      const eventEnd = new Date(reminderTime);
      eventEnd.setMinutes(
        eventEnd.getMinutes() + CALENDAR_CONSTANTS.EVENT_DURATION
      );

      return [
        "BEGIN:VEVENT",
        `DTSTART;TZID=${timezone}:${formatDateTimeWithZone(reminderTime)}`,
        `DTEND;TZID=${timezone}:${formatDateTimeWithZone(eventEnd)}`,
        `DTSTAMP:${formatDateTime(new Date())}`,
        `UID:${generateUID(date, schedule.bedtime)}`,
        `SUMMARY:${escapeText(
          (schedule.dstChange ? "⚠️ " : "") +
            CALENDAR_MESSAGES.EVENT_TITLE(schedule.bedtime, displayWakeTime)
        )}`,
        `DESCRIPTION:${escapeText(description)}`,
        "BEGIN:VALARM",
        `TRIGGER:-PT${CALENDAR_CONSTANTS.REMINDER_BEFORE_MINUTES}M`,
        "ACTION:DISPLAY",
        `DESCRIPTION:${CALENDAR_MESSAGES.REMINDER_DESCRIPTION}`,
        "END:VALARM",
        "END:VEVENT",
      ];
    });
}

function calculateReminderTime(date, bedtime) {
  const { hours, minutes } = parseTime(bedtime);
  // Use local timezone.
  const reminderTime = new Date(date);
  reminderTime.setHours(
    hours - 0,
    minutes - CALENDAR_CONSTANTS.MINUTES_BEFORE_BEDTIME, // subtract preparation time
    0, // seconds
    0 // milliseconds
  );

  return reminderTime;
}

function formatDateTime(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "") // Remove dashes and colons.
    .replace(/\.\d{3}/g, ""); // Remove milliseconds.
}

function generateTimezoneBlock() {
  return ["BEGIN:VTIMEZONE", `TZID:${getUserTimezone()}`, "END:VTIMEZONE"].join(
    CALENDAR_CONSTANTS.LINE_ENDING
  );
}

function formatDateTimeWithZone(date) {
  return [
    date.getFullYear(), // YYYY
    String(date.getMonth() + 1).padStart(2, "0"), // MM
    String(date.getDate()).padStart(2, "0"), // DD
    "T",
    String(date.getHours()).padStart(2, "0"), // HH
    String(date.getMinutes()).padStart(2, "0"), // MM
    "00", // SS (always 00 for our events)
  ].join("");
}

function getUserLocale() {
  return navigator.language || "en-GB";
}

function generateUID(date, bedtime) {
  return `sleep-${date}-${bedtime.replace(
    ":",
    ""
  )}@${APP_NAME.toLowerCase().replace(/\s+/g, "-")}`;
}

function escapeText(text) {
  return text.replace(/[\\;,]/g, "\\$&").replace(/\n/g, "\\n");
}

function downloadCalendar(scheduleData) {
  try {
    const content = generateCalendar(scheduleData);
    let blob;
    if (navigator.userAgent.indexOf("MSIE 10") === -1) {
      // chrome or firefox
      blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    } else {
      // ie
      const bb = new BlobBuilder();
      bb.append(content);
      blob = bb.getBlob("text/calendar;charset=" + document.characterSet);
    }
    const now = new Date();
    const timestamp = now.toISOString().split("T")[0];
    const filename = APP_NAME + `-${timestamp}.ics`;
    // Uses FileSaver.js: https://github.com/eligrey/FileSaver.js
    saveAs(blob, filename);
    return content;
  } catch (error) {
    console.error("Failed to generate calendar:", error);
    throw error;
  }
}

// Show user timezone in footer.
headerLogo = document.getElementById('headerLogo')
document.getElementById("userTimezone").textContent = Intl.DateTimeFormat()
  .resolvedOptions()
  .timeZone.replace(/_/g, " ");

ClockComponent.inject(currentContainer, "current");
ClockComponent.inject(goalContainer, "goal");

const sleepGoal = new SleepGoal();
const currentScheduler = new SleepScheduler("current", sleepGoal);
const goalScheduler = new SleepScheduler("goal", sleepGoal);
const datePicker = new DatePicker(currentScheduler, goalScheduler);
const scheduleResults = new SleepScheduleResults(
  currentScheduler,
  goalScheduler,
  datePicker
);

const wizardManager = new WizardManager(scheduleResults);
