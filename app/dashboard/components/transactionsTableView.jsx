"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, LoaderCircle, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { assignableAccounts, isUncategorized } from "@/lib/chartOfAccounts";
import { DeleteTransactionDialog, EditTransactionModal } from "./transactionDialogs";

const money = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
const csvValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function TransactionsTableView({ transactions, onUpdate, onDelete }) {
	const [editing, setEditing] = useState(null);
	const [deleting, setDeleting] = useState(null);
	const [categorisingId, setCategorisingId] = useState(null);
	const [error, setError] = useState("");

	// Uncategorised rows first so they can be worked through; the original order is kept within each group.
	const sortedTransactions = useMemo(() => [...transactions].sort((first, second) => Number(isUncategorized(second)) - Number(isUncategorized(first))), [transactions]);
	const uncategorisedCount = useMemo(() => transactions.filter((transaction) => isUncategorized(transaction)).length, [transactions]);

	const quickCategorise = async (transaction, account) => {
		if (!account) return;
		setCategorisingId(transaction.id); setError("");
		try { await onUpdate(transaction.id, { account }); } catch (updateError) { setError(updateError.message || "Unable to update the account"); } finally { setCategorisingId(null); }
	};

	const exportCsv = () => {
		const headers = ["Date", "Transaction line description", "Amount", "Type", "Account", "Supplier", "Note"];
		const rows = sortedTransactions.map((transaction) => [transaction.date, transaction.description, transaction.amount, transaction.type, transaction.account, transaction.supplier, transaction.note]);
		const csv = [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");
		const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
		link.click();
		URL.revokeObjectURL(url);
	};

	return <section className="bg-white p-6">
		<div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Ledger</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Recent transactions</h2></div><button type="button" onClick={exportCsv} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#0f766e] hover:text-[#0f766e]"><Download size={15} /> Export CSV</button></div>
		{uncategorisedCount > 0 && <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><TriangleAlert size={16} className="shrink-0" /><span><strong>{uncategorisedCount}</strong> {uncategorisedCount === 1 ? "transaction needs" : "transactions need"} an account head. They&apos;re pinned to the top — pick an account inline or use edit.</span></div>}
		{error && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
		<div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[1050px] text-left text-sm">
			<thead className="bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Transaction line description</th><th className="px-4 py-3 font-medium">Amount</th><th className="px-4 py-3 font-medium">Account</th><th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium">Note</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
			<tbody className="divide-y divide-slate-100">{sortedTransactions.map((transaction) => {
				const uncategorised = isUncategorized(transaction);
				const categorising = categorisingId === transaction.id;
				return <tr key={transaction.id} className={`transition ${uncategorised ? "bg-amber-50/70 shadow-[inset_3px_0_0_#f59e0b] hover:bg-amber-50" : "hover:bg-slate-50/70"}`}>
					<td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateFormat.format(new Date(`${transaction.date}T00:00:00`))}</td>
					<td className="max-w-[220px] px-4 py-3 font-medium text-slate-800">{transaction.description}</td>
					<td className="whitespace-nowrap px-4 py-3"><span className={`flex items-center gap-1.5 font-semibold ${transaction.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>{transaction.type === "credit" ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}{transaction.type === "credit" ? "+" : "-"}{money(transaction.amount)}</span></td>
					<td className="px-4 py-3 text-slate-600">{uncategorised ? <div className="flex min-w-[200px] flex-col gap-1.5"><span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"><TriangleAlert size={12} /> {transaction.account ? `${transaction.account} · needs account` : "Uncategorised"}</span><div className="relative"><select value="" disabled={categorising} onChange={(event) => quickCategorise(transaction, event.target.value)} aria-label={`Choose an account for ${transaction.description}`} className="h-8 w-full cursor-pointer rounded-md border border-amber-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/10 disabled:cursor-wait disabled:opacity-60"><option value="">{categorising ? "Saving..." : "Assign account..."}</option>{assignableAccounts.map(([code, account]) => <option key={code} value={account}>{code} - {account}</option>)}</select>{categorising && <LoaderCircle size={14} className="absolute right-7 top-2 animate-spin text-slate-400" />}</div></div> : transaction.account}</td>
					<td className="px-4 py-3 text-slate-600">{transaction.supplier}</td>
					<td className="max-w-[180px] truncate px-4 py-3 text-slate-500" title={transaction.note}>{transaction.note || "-"}</td>
					<td className="whitespace-nowrap px-4 py-3 text-right"><div className="inline-flex gap-1"><button type="button" onClick={() => setEditing(transaction)} aria-label="Edit transaction" title="Edit" className="rounded-lg p-2 text-slate-400 transition hover:bg-[#ccfbf1] hover:text-[#0f766e]"><Pencil size={15} /></button><button type="button" onClick={() => setDeleting(transaction)} aria-label="Delete transaction" title="Delete" className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button></div></td>
				</tr>;
			})}</tbody>
		</table>{transactions.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No transactions match these filters.</p>}</div>
		{editing && <EditTransactionModal transaction={editing} onClose={() => setEditing(null)} onSave={onUpdate} />}
		{deleting && <DeleteTransactionDialog transaction={deleting} onClose={() => setDeleting(null)} onDelete={onDelete} />}
	</section>;
}
