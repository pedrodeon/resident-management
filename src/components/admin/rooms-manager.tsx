"use client";

import { useState, useTransition } from "react";
import { createRoom, updateRoom, deleteRoom } from "@/app/(app)/admin/rooms/actions";

export type AdminRoom = {
  id: string;
  room_number: string;
  capacity: number;
  occupants: number;
};
export type HallwayGroup = { id: string; name: string; rooms: AdminRoom[] };

export function RoomsManager({ hallways }: { hallways: HallwayGroup[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hallwayId, setHallwayId] = useState(hallways[0]?.id ?? "");
  const [roomNumber, setRoomNumber] = useState("");
  const [capacity, setCapacity] = useState("2");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else onOk?.();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hallway</span>
          <select
            value={hallwayId}
            onChange={(e) => setHallwayId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          >
            {hallways.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Room number</span>
          <input
            type="text"
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Capacity</span>
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>
        <button
          type="button"
          onClick={() =>
            run(() => createRoom(hallwayId, roomNumber, Number(capacity)), () => setRoomNumber(""))
          }
          disabled={isPending || !roomNumber.trim()}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
        >
          Add room
        </button>
      </div>

      {hallways.map((h) => (
        <div key={h.id}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{h.name}</h2>
          {h.rooms.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No rooms.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {h.rooms.map((room) => (
                <RoomRow key={room.id} room={room} disabled={isPending} run={run} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function RoomRow({
  room,
  disabled,
  run,
}: {
  room: AdminRoom;
  disabled: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [number, setNumber] = useState(room.room_number);
  const [capacity, setCapacity] = useState(String(room.capacity));
  const dirty = number !== room.room_number || capacity !== String(room.capacity);

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <input
        type="text"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        aria-label="Room number"
        className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      <input
        type="number"
        min={1}
        value={capacity}
        onChange={(e) => setCapacity(e.target.value)}
        aria-label="Capacity"
        className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      <span className="text-xs text-gray-500">{room.occupants} in room</span>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          onClick={() => run(() => updateRoom(room.id, number, Number(capacity)))}
          disabled={disabled || !dirty}
          className="rounded-md border border-navy px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy hover:text-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete room ${room.room_number}?`)) run(() => deleteRoom(room.id));
          }}
          disabled={disabled}
          className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
