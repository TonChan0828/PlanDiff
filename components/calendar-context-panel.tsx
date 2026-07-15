"use client";

import { useSyncExternalStore } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarClock, Lightbulb, Pencil, X } from "lucide-react";
import type { CalendarViewEvent } from "@/components/calendar-view";
import { PlanSuggestions } from "@/components/plan-suggestions";
import { CALENDAR_MESSAGES as M } from "@/lib/calendar/messages";
import type { RecurringRuleSummary } from "@/lib/calendar/recurring-id";
import type { TimeEntryItem } from "@/lib/timer/types";

export type CalendarContextTab = "day" | "suggestions";

function subscribeDesktop(callback: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getDesktopSnapshot() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(min-width: 1024px)").matches)
  );
}

interface CalendarContextPanelProps {
  open: boolean;
  tab: CalendarContextTab;
  selectedDate: Date;
  events: CalendarViewEvent[];
  timeEntries: TimeEntryItem[];
  recurringRules: RecurringRuleSummary[];
  suggestionEntries: TimeEntryItem[];
  viewDate: string;
  onTabChange: (tab: CalendarContextTab) => void;
  onClose: () => void;
  onEditEvent: (event: CalendarViewEvent) => void;
  onEditEntry: (entry: TimeEntryItem) => void;
}

export function CalendarContextPanel({
  open,
  tab,
  selectedDate,
  events,
  timeEntries,
  recurringRules,
  suggestionEntries,
  viewDate,
  onTabChange,
  onClose,
  onEditEvent,
  onEditEntry,
}: CalendarContextPanelProps) {
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    getDesktopSnapshot,
    () => false,
  );
  const visible = open || desktop;
  const dayEvents = events
    .filter((event) => isSameDay(parseISO(event.startAt), selectedDate))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const dayEntries = timeEntries
    .filter((entry) => isSameDay(parseISO(entry.startAt), selectedDate))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  return (
    <>
      {open && !desktop ? (
        <button
          type="button"
          aria-label={M.contextClose}
          onClick={onClose}
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
        />
      ) : null}
      {visible ? (
        <aside
          aria-label={M.contextHeading}
          className={`${visible ? "flex" : "hidden"} border-line bg-surface fixed inset-x-0 bottom-0 z-30 max-h-[82dvh] flex-col rounded-t-xl border-t lg:static lg:z-auto lg:w-76 lg:shrink-0 lg:rounded-lg lg:border`}
        >
          <div className="border-line flex min-h-12 items-center justify-between border-b px-3 lg:px-4">
            <p className="font-mono text-sm font-semibold tabular-nums">
              {format(selectedDate, "M月d日(E)", { locale: ja })}
            </p>
            <button
              type="button"
              aria-label={M.contextClose}
              onClick={onClose}
              className="text-ink-muted hover:bg-ink/5 inline-flex h-11 w-11 items-center justify-center rounded-lg lg:hidden"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <div
            role="tablist"
            aria-label={M.contextHeading}
            className="border-line grid grid-cols-2 border-b p-1.5"
          >
            <ContextTab
              selected={tab === "day"}
              onClick={() => onTabChange("day")}
              icon={<CalendarClock aria-hidden="true" className="h-4 w-4" />}
            >
              {M.contextDayTab}
            </ContextTab>
            <ContextTab
              selected={tab === "suggestions"}
              onClick={() => onTabChange("suggestions")}
              icon={<Lightbulb aria-hidden="true" className="h-4 w-4" />}
            >
              {M.contextSuggestionTab}
            </ContextTab>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 lg:p-4">
            {tab === "day" ? (
              <div className="flex flex-col gap-5">
                <ContextList
                  heading={M.contextPlansHeading}
                  empty={M.contextPlansEmpty}
                >
                  {dayEvents.map((event) => (
                    <li
                      key={event.id}
                      className="border-line flex items-center gap-2 border-b py-2 last:border-b-0"
                    >
                      <ContextItem
                        title={event.title}
                        startAt={event.startAt}
                        endAt={event.endAt}
                      />
                      {event.source === "app" ? (
                        <EditButton
                          label={M.eventEditLabel(event.title)}
                          onClick={() => onEditEvent(event)}
                        />
                      ) : (
                        <span className="text-ink-muted text-xs">
                          {M.contextReadOnly}
                        </span>
                      )}
                    </li>
                  ))}
                </ContextList>
                <ContextList
                  heading={M.contextActualsHeading}
                  empty={M.contextActualsEmpty}
                >
                  {dayEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className="border-line flex items-center gap-2 border-b py-2 last:border-b-0"
                    >
                      <ContextItem
                        title={entry.title}
                        startAt={entry.startAt}
                        endAt={entry.endAt}
                      />
                      <EditButton
                        label={`${entry.title || M.untitled}の実績を編集`}
                        onClick={() => onEditEntry(entry)}
                      />
                    </li>
                  ))}
                </ContextList>
              </div>
            ) : (
              <PlanSuggestions
                entries={suggestionEntries}
                events={events}
                recurringRules={recurringRules}
                viewDate={viewDate}
              />
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}

function ContextTab({
  selected,
  onClick,
  icon,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${selected ? "bg-plan-fill text-brand" : "text-ink-muted hover:bg-ink/5"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function ContextList({
  heading,
  empty,
  children,
}: {
  heading: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section>
      <h2 className="text-ink-muted mb-1 text-xs font-semibold">{heading}</h2>
      {children.length > 0 ? (
        <ul>{children}</ul>
      ) : (
        <p className="text-ink-muted py-3 text-sm">{empty}</p>
      )}
    </section>
  );
}

function ContextItem({
  title,
  startAt,
  endAt,
}: {
  title: string;
  startAt: string;
  endAt: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{title || M.untitled}</p>
      <p className="text-ink-muted font-mono text-xs tabular-nums">
        {format(parseISO(startAt), "HH:mm")}〜{format(parseISO(endAt), "HH:mm")}
      </p>
    </div>
  );
}

function EditButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="border-line text-ink-muted hover:bg-ink/5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border"
    >
      <Pencil aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
