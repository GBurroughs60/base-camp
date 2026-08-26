"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { updateField } from "@/app/actions/records";
import {
  type PlayStatus,
  LIVE_PIPELINE_STATUSES,
  PLAY_STATUS_LABELS,
} from "@/lib/playStatus";

export type BoardPlay = {
  id: string;
  status: PlayStatus;
  artist_name: string | null;
  venue_label: string | null;
  show_date: string | null;
  guarantee_amount: number | null;
};

function formatMoney(n: number | null) {
  if (n === null || n === undefined) return null;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function Card({ play }: { play: BoardPlay }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: play.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 p-2.5 text-sm shadow-sm cursor-grab active:cursor-grabbing touch-none select-none ${
        isDragging ? "opacity-40 z-10 relative" : ""
      }`}
    >
      <div className="font-medium mb-0.5 truncate">{play.artist_name ?? "Play"}</div>
      <div className="text-black/60 dark:text-white/60 text-xs mb-1.5 truncate">
        {play.venue_label ?? "No venue"}
      </div>
      <div className="flex items-center justify-between text-xs text-black/50 dark:text-white/50 gap-1">
        <span className="truncate">{play.show_date ?? "No date"}</span>
        {play.guarantee_amount != null && (
          <span className="shrink-0">{formatMoney(play.guarantee_amount)}</span>
        )}
      </div>
      <Link
        href={`/plays/${play.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        className="mt-2 inline-block text-xs text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
      >
        Open →
      </Link>
    </div>
  );
}

function Column({ status, plays }: { status: PlayStatus; plays: BoardPlay[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`min-w-0 rounded-lg border p-2.5 flex flex-col gap-2 min-h-[240px] transition-colors ${
        isOver
          ? "border-ridge-orange/50 bg-ridge-orange/5"
          : "border-black/10 dark:border-white/10 bg-black/[.02] dark:bg-white/[.03]"
      }`}
    >
      <div className="flex items-center justify-between mb-1 gap-1">
        <h3 className="text-xs font-medium leading-tight">{PLAY_STATUS_LABELS[status]}</h3>
        <span className="text-xs text-black/40 dark:text-white/40 shrink-0">{plays.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {plays.map((p) => (
          <Card key={p.id} play={p} />
        ))}
        {plays.length === 0 && (
          <p className="text-xs text-black/30 dark:text-white/30 italic">No plays</p>
        )}
      </div>
    </div>
  );
}

// HubSpot-style pipeline board: one column per live status, full
// drag-and-drop between them. Dropping a card commits immediately via the
// generic updateField action, with optimistic local reordering so the move
// feels instant rather than waiting on a round trip + router.refresh().
export default function PlaysBoard({ plays: initialPlays }: { plays: BoardPlay[] }) {
  const router = useRouter();
  const [plays, setPlays] = useState(initialPlays);
  // Re-sync local (optimistic) state when the server hands us fresh props
  // (e.g. after router.refresh()) -- setState-during-render is the React-
  // recommended way to "adjust state when a prop changes", rather than an
  // effect that would cause an extra cascading render.
  const [syncedPlays, setSyncedPlays] = useState(initialPlays);
  if (initialPlays !== syncedPlays) {
    setSyncedPlays(initialPlays);
    setPlays(initialPlays);
  }
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const playId = active.id as string;
    const newStatus = over.id as PlayStatus;
    const current = plays.find((p) => p.id === playId);
    if (!current || current.status === newStatus) return;
    const previousStatus = current.status;

    setError(null);
    setPlays((prev) =>
      prev.map((p) => (p.id === playId ? { ...p, status: newStatus } : p))
    );

    startTransition(async () => {
      const res = await updateField("plays", playId, "status", newStatus);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
        setPlays((prev) =>
          prev.map((p) => (p.id === playId ? { ...p, status: previousStatus } : p))
        );
      }
    });
  }

  return (
    <div>
      {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {/* A grid rather than a fixed-width flex row -- all pipeline stages
            share the available width and shrink together, so the whole
            board reads as one horizontal view instead of requiring a
            scroll to see later stages. The minmax floor keeps columns from
            getting so narrow that cards become unreadable; overflow-x-auto
            is just the fallback for a viewport too narrow to honor it. */}
        <div className="overflow-x-auto pb-2">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${LIVE_PIPELINE_STATUSES.length}, minmax(150px, 1fr))`,
            }}
          >
            {LIVE_PIPELINE_STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                plays={plays.filter((p) => p.status === status)}
              />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}
