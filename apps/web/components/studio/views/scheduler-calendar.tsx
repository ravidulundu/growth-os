"use client";

import { useMemo, useState } from "react";
import type { JobRow } from "../../../lib/api";
import { Button } from "../../ui/button";

type SchedulerCalendarProps = {
  jobs: Array<Pick<JobRow, "id" | "state" | "run_at" | "content_title">>;
  onSlotClick: (date: Date) => void;
};

type CalendarMode = "week" | "month";

type CalendarJob = Pick<JobRow, "id" | "state" | "run_at" | "content_title"> & {
  runDate: Date;
};

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_item, hour) => hour);

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const dayStart = startOfDay(date);
  const dayIndex = (dayStart.getDay() + 6) % 7;
  return addDays(dayStart, -dayIndex);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function localSlotKey(date: Date) {
  return `${localDateKey(date)}-${date.getHours()}`;
}

function slotDate(day: Date, hour: number) {
  const next = new Date(day);
  next.setHours(hour, 0, 0, 0);
  return next;
}

function parseJobs(jobs: SchedulerCalendarProps["jobs"]): CalendarJob[] {
  return jobs
    .map((job) => ({ ...job, runDate: new Date(job.run_at) }))
    .filter((job) => !Number.isNaN(job.runDate.getTime()));
}

function groupJobsBySlot(jobs: CalendarJob[]) {
  const map = new Map<string, CalendarJob[]>();
  for (const job of jobs) {
    const key = localSlotKey(job.runDate);
    const existing = map.get(key);
    if (existing) {
      existing.push(job);
      continue;
    }
    map.set(key, [job]);
  }
  return map;
}

function groupJobsByDay(jobs: CalendarJob[]) {
  const map = new Map<string, CalendarJob[]>();
  for (const job of jobs) {
    const key = localDateKey(job.runDate);
    const existing = map.get(key);
    if (existing) {
      existing.push(job);
      continue;
    }
    map.set(key, [job]);
  }
  return map;
}

function slotStateClassName(state: string) {
  if (state === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (state === "queued" || state === "retry_wait") {
    return "bg-sky-100 text-sky-700";
  }
  if (state === "in_progress") {
    return "bg-amber-100 text-amber-700";
  }
  if (state === "failed_permanent" || state === "cancelled") {
    return "bg-red-100 text-red-700";
  }
  return "bg-[var(--secondary)] text-[var(--muted-foreground)]";
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function weekLabel(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  return `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

type CalendarToolbarProps = {
  mode: CalendarMode;
  cursorDate: Date;
  onModeChange: (mode: CalendarMode) => void;
  onCursorChange: (date: Date) => void;
};

function CalendarToolbar({ mode, cursorDate, onModeChange, onCursorChange }: CalendarToolbarProps) {
  const label = mode === "week" ? weekLabel(startOfWeek(cursorDate)) : monthLabel(cursorDate);

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={mode === "week" ? "default" : "outline"}
          onClick={() => onModeChange("week")}
        >
          Weekly
        </Button>
        <Button
          variant={mode === "month" ? "default" : "outline"}
          onClick={() => onModeChange("month")}
        >
          Monthly
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            onCursorChange(
              mode === "week"
                ? addDays(cursorDate, -7)
                : new Date(cursorDate.getFullYear(), cursorDate.getMonth() - 1, 1)
            )
          }
        >
          Prev
        </Button>
        <Button variant="outline" onClick={() => onCursorChange(new Date())}>
          Today
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            onCursorChange(
              mode === "week"
                ? addDays(cursorDate, 7)
                : new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1)
            )
          }
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function JobChip({ job }: { job: CalendarJob }) {
  const title = job.content_title?.trim() || "Scheduled content";
  return (
    <span
      className={`inline-flex max-w-full truncate rounded px-1 py-0.5 text-[10px] font-medium ${slotStateClassName(job.state)}`}
      title={`${title} (${job.state})`}
    >
      {title}
    </span>
  );
}

type WeeklyHourRowProps = {
  hour: number;
  days: Date[];
  jobsBySlot: Map<string, CalendarJob[]>;
  onSlotClick: (date: Date) => void;
};

function WeeklyHourRow({ hour, days, jobsBySlot, onSlotClick }: WeeklyHourRowProps) {
  return (
    <div className="contents">
      <div className="border-b border-r border-[var(--border)] px-2 py-2 text-xs text-[var(--muted-foreground)]">
        {formatHour(hour)}
      </div>
      {days.map((day) => {
        const date = slotDate(day, hour);
        const slotJobs = jobsBySlot.get(localSlotKey(date)) ?? [];
        return (
          <button
            key={localSlotKey(date)}
            type="button"
            onClick={() => onSlotClick(date)}
            className="min-h-14 border-b border-r border-[var(--border)] p-1 text-left hover:bg-[var(--secondary)]/70"
          >
            <div className="flex flex-wrap gap-1">
              {slotJobs.slice(0, 2).map((job) => (
                <JobChip key={job.id} job={job} />
              ))}
              {slotJobs.length > 2 ? (
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  +{slotJobs.length - 2}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

type WeeklyCalendarGridProps = {
  weekStart: Date;
  jobsBySlot: Map<string, CalendarJob[]>;
  onSlotClick: (date: Date) => void;
};

function WeeklyCalendarGrid({ weekStart, jobsBySlot, onSlotClick }: WeeklyCalendarGridProps) {
  const days = Array.from({ length: 7 }, (_item, index) => addDays(weekStart, index));

  return (
    <div className="overflow-auto rounded-xl border border-[var(--border)]">
      <div className="grid min-w-[760px] grid-cols-[80px_repeat(7,minmax(120px,1fr))]">
        <div className="border-b border-r border-[var(--border)] bg-[var(--muted)] p-2 text-xs font-semibold text-[var(--muted-foreground)]">
          Hour
        </div>
        {days.map((day, index) => (
          <div
            key={localDateKey(day)}
            className="border-b border-r border-[var(--border)] bg-[var(--muted)] p-2 text-xs font-semibold text-[var(--muted-foreground)]"
          >
            {WEEK_DAYS[index]} {day.getDate()}
          </div>
        ))}
        {HOURS.map((hour) => (
          <WeeklyHourRow
            key={`hour-${hour}`}
            hour={hour}
            days={days}
            jobsBySlot={jobsBySlot}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  );
}

type MonthlyCalendarGridProps = {
  cursorDate: Date;
  jobsByDay: Map<string, CalendarJob[]>;
  onSlotClick: (date: Date) => void;
};

function MonthlyCalendarGrid({ cursorDate, jobsByDay, onSlotClick }: MonthlyCalendarGridProps) {
  const monthStart = startOfMonth(cursorDate);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_item, index) => addDays(gridStart, index));

  return (
    <div className="rounded-xl border border-[var(--border)]">
      <div className="grid grid-cols-7">
        {WEEK_DAYS.map((label) => (
          <div
            key={label}
            className="border-b border-r border-[var(--border)] bg-[var(--muted)] p-2 text-center text-xs font-semibold text-[var(--muted-foreground)] last:border-r-0"
          >
            {label}
          </div>
        ))}
        {days.map((day, index) => {
          const dayJobs = jobsByDay.get(localDateKey(day)) ?? [];
          const inCurrentMonth = day.getMonth() === monthStart.getMonth();
          const slot = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0, 0);
          return (
            <button
              key={`${localDateKey(day)}-${index}`}
              type="button"
              onClick={() => onSlotClick(slot)}
              className={`min-h-24 border-b border-r border-[var(--border)] p-2 text-left ${inCurrentMonth ? "bg-[var(--background)] hover:bg-[var(--secondary)]/70" : "bg-[var(--muted)]/40 text-[var(--muted-foreground)]"} ${index % 7 === 6 ? "border-r-0" : ""}`}
            >
              <p className="text-xs font-semibold">{day.getDate()}</p>
              {dayJobs.length > 0 ? (
                <span className="mt-1 inline-flex rounded bg-[var(--secondary)] px-2 py-0.5 text-[10px] text-[var(--foreground)]">
                  {dayJobs.length} jobs
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SchedulerCalendar({ jobs, onSlotClick }: SchedulerCalendarProps) {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const parsedJobs = useMemo(() => parseJobs(jobs), [jobs]);
  const jobsBySlot = useMemo(() => groupJobsBySlot(parsedJobs), [parsedJobs]);
  const jobsByDay = useMemo(() => groupJobsByDay(parsedJobs), [parsedJobs]);

  return (
    <section>
      <CalendarToolbar
        mode={mode}
        cursorDate={cursorDate}
        onModeChange={setMode}
        onCursorChange={setCursorDate}
      />
      {mode === "week" ? (
        <WeeklyCalendarGrid
          weekStart={startOfWeek(cursorDate)}
          jobsBySlot={jobsBySlot}
          onSlotClick={onSlotClick}
        />
      ) : (
        <MonthlyCalendarGrid
          cursorDate={cursorDate}
          jobsByDay={jobsByDay}
          onSlotClick={onSlotClick}
        />
      )}
    </section>
  );
}
