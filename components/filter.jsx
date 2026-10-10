"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Filter, RotateCcw, Search, X } from "lucide-react";

const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/10";

const dateLabel = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "Select date";
const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function DateRangePicker({ from, to, onChange }) {
	const [open, setOpen] = useState(false);
	const [month, setMonth] = useState(() => new Date(`${from || to || "2026-09-01"}T00:00:00`));
	const [draftFrom, setDraftFrom] = useState(from);
	const [draftTo, setDraftTo] = useState(to);
	const pickerRef = useRef(null);

	useEffect(() => {
		const closePicker = (event) => { if (pickerRef.current && !pickerRef.current.contains(event.target)) setOpen(false); };
		document.addEventListener("mousedown", closePicker);
		return () => document.removeEventListener("mousedown", closePicker);
	}, []);
	const days = useMemo(() => {
		const first = new Date(month.getFullYear(), month.getMonth(), 1);
		const start = new Date(first);
		start.setDate(first.getDate() - first.getDay());
		return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
	}, [month]);
	const chooseDate = (date) => {
		const value = dateValue(date);
		if (!draftFrom || (draftFrom && draftTo)) { setDraftFrom(value); setDraftTo(""); return; }
		const range = value < draftFrom ? { from: value, to: draftFrom } : { from: draftFrom, to: value };
		setDraftFrom(range.from); setDraftTo(range.to); onChange(range); setOpen(false);
	};
	const clearDates = () => { setDraftFrom(""); setDraftTo(""); onChange({ from: "", to: "" }); };

	return <div ref={pickerRef} className="relative"><button type="button" onClick={() => setOpen(!open)} className={`${selectClass} flex items-center gap-2 text-left`} aria-expanded={open}><CalendarDays size={16} className="shrink-0 text-slate-400" /><span className="truncate">{from || to ? `${dateLabel(from)} - ${dateLabel(to)}` : "Select date range"}</span></button>{open && <div className="absolute left-0 top-12 z-20 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"><div className="mb-3 flex items-center justify-between"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Previous month"><ChevronLeft size={16} /></button><p className="text-sm font-semibold text-slate-800">{new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(month)}</p><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Next month"><ChevronRight size={16} /></button></div><div className="mb-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-slate-400">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day}>{day}</span>)}</div><div className="grid grid-cols-7 gap-y-1">{days.map((day) => { const value = dateValue(day); const selected = value === draftFrom || value === draftTo; const inRange = draftFrom && draftTo && value > draftFrom && value < draftTo; return <button type="button" key={value} onClick={() => chooseDate(day)} className={`h-8 rounded-md text-xs ${day.getMonth() === month.getMonth() ? "text-slate-700" : "text-slate-300"} ${inRange ? "bg-[#ccfbf1] text-[#0f766e]" : "hover:bg-slate-100"} ${selected ? "bg-[#0f766e] font-semibold text-white" : ""}`}>{day.getDate()}</button>; })}</div><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs text-slate-500">{draftFrom && !draftTo ? "Now select the end date" : "Choose a date range"}</span>{(from || to) && <button type="button" onClick={clearDates} className="text-xs font-medium text-[#0f766e] hover:underline">Clear dates</button>}</div></div>}</div>;
}

function AccountPicker({ accounts, selected, onChange }) {
	const [open, setOpen] = useState(false);
	const pickerRef = useRef(null);
	useEffect(() => {
		const closePicker = (event) => { if (pickerRef.current && !pickerRef.current.contains(event.target)) setOpen(false); };
		document.addEventListener("mousedown", closePicker);
		return () => document.removeEventListener("mousedown", closePicker);
	}, []);
	const toggleAccount = (account) => onChange(selected.includes(account) ? selected.filter((item) => item !== account) : [...selected, account]);
	const label = selected.length === 0 ? "All accounts" : selected.length === 1 ? selected[0] : `${selected.length} accounts selected`;
	return <div ref={pickerRef} className="relative min-w-0"><button type="button" onClick={() => setOpen(!open)} className={`${selectClass} flex items-center justify-between gap-2 text-left`} aria-expanded={open}><span className="truncate">{label}</span><ChevronDown size={16} className="shrink-0 text-slate-400" /></button>{open && <div className="absolute left-0 top-12 z-20 max-h-64 w-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">{accounts.map((account) => <label key={account} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(account)} onChange={() => toggleAccount(account)} className="sr-only" /><span className={`flex h-4 w-4 items-center justify-center rounded border ${selected.includes(account) ? "border-[#0f766e] bg-[#0f766e] text-white" : "border-slate-300"}`}>{selected.includes(account) && <Check size={12} />}</span><span className="truncate">{account || "Uncategorised"}</span></label>)}</div>}</div>;
}

export default function FilterBar({ filters, accounts, onChange, onReset, resultCount }) {
	const update = (name, value) => onChange({ ...filters, [name]: value });
	const hasFilters = Object.entries(filters).some(([name, value]) => name === "accounts" ? value.length > 0 : Boolean(value));
	return (
		<section className="border-b border-slate-200 bg-white px-6 py-5" aria-label="Transaction filters">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Filter size={17} className="text-[#0f766e]" /><h2 className="text-sm font-semibold text-slate-900">Filter transactions</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{resultCount} results</span></div>{hasFilters && <button type="button" onClick={onReset} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0f766e]"><RotateCcw size={14} /> Clear all</button>}</div>
			<div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
				<label className="relative min-w-0 lg:col-span-2"><span className="sr-only">Search transactions</span><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder="Search description, supplier or note" className={`${selectClass} pl-9`} />{filters.search && <button type="button" onClick={() => update("search", "")} aria-label="Clear search" className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"><X size={15} /></button>}</label>
				<AccountPicker accounts={accounts} selected={filters.accounts} onChange={(value) => update("accounts", value)} />
				<div className="relative min-w-0"><DateRangePicker key={`${filters.from}-${filters.to}`} from={filters.from} to={filters.to} onChange={(range) => onChange({ ...filters, ...range })} /></div>
				<label className="min-w-0"><span className="sr-only">Transaction type</span><select value={filters.type} onChange={(event) => update("type", event.target.value)} className={selectClass}><option value="">Credit & debit</option><option value="debit">Debits only</option><option value="credit">Credits only</option></select></label>
				<input type="number" min="0" value={filters.amount} onChange={(event) => update("amount", event.target.value)} placeholder="Amount" aria-label="Amount" className={`${selectClass} min-w-0`} />
			</div>
		</section>
	);
}
