"use client";

import { useState, useTransition } from "react";
import { createItem, updateItem, deleteItem } from "@/app/(app)/admin/inventory/actions";

export type AdminItem = { id: string; name: string; sort_order: number };

export function InventoryManager({ items }: { items: AdminItem[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");

  const nextOrder = items.reduce((max, i) => Math.max(max, i.sort_order), 0) + 1;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else onOk?.();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">New item</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Mini-fridge"
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>
        <button
          type="button"
          onClick={() => run(() => createItem(newName, nextOrder), () => setNewName(""))}
          disabled={isPending || !newName.trim()}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {[...items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => (
            <ItemRow key={item.id} item={item} disabled={isPending} run={run} />
          ))}
      </ul>
    </div>
  );
}

function ItemRow({
  item,
  disabled,
  run,
}: {
  item: AdminItem;
  disabled: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState(item.name);
  const [order, setOrder] = useState(String(item.sort_order));
  const dirty = name !== item.name || order !== String(item.sort_order);

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <input
        type="number"
        value={order}
        onChange={(e) => setOrder(e.target.value)}
        aria-label={`${item.name} order`}
        className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={`${item.name} name`}
        className="min-w-40 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={() => run(() => updateItem(item.id, name, Number(order)))}
        disabled={disabled || !dirty}
        className="rounded-md border border-navy px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy hover:text-white disabled:opacity-40"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm(`Delete "${item.name}" from the template?`)) run(() => deleteItem(item.id));
        }}
        disabled={disabled}
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Delete
      </button>
    </li>
  );
}
