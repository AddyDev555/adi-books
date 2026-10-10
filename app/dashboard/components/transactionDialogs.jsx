"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Pencil, Trash2, TriangleAlert, X } from "lucide-react";
import { assignableAccounts, isUncategorized } from "@/lib/chartOfAccounts";

const inputClass = "mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/10";
const money = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

// Signed amount in the form (negative = debit), split back into the sheet's credit/debit columns on save.
const toForm = (transaction) => ({
	date: transaction.date || "",
	transactionLineDescription: transaction.description || "",
	amount: transaction.amount ? String(transaction.type === "debit" ? -transaction.amount : transaction.amount) : "",
	account: isUncategorized(transaction) ? "" : transaction.account,
	supplier: transaction.supplier || "",
	note: transaction.note || "",
});
const toSheetData = ({ amount, ...form }) => {
	const value = Number(amount);
	return { ...form, creditAmount: value > 0 ? value : 0, debitAmount: value < 0 ? -value : 0 };
};

function Dialog({ title, icon, onClose, busy, children }) {
	useEffect(() => {
		const closeOnEscape = (event) => { if (event.key === "Escape" && !busy) onClose(); };
		document.addEventListener("keydown", closeOnEscape);
		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [busy, onClose]);
	return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"><div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">{icon}<h2 className="font-semibold text-slate-950">{title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X size={18} /></button></div>{children}</div></div>;
}

export function EditTransactionModal({ transaction, onClose, onSave }) {
	const [form, setForm] = useState(() => toForm(transaction));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const amount = Number(form.amount);
	const transactionType = amount < 0 ? "debit" : amount > 0 ? "credit" : "";
	const needsAccount = !form.account;

	const updateField = (event) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); };
	const handleSubmit = async (event) => {
		event.preventDefault();
		if (amount === 0) { setError("Enter a non-zero amount."); return; }
		setSaving(true); setError("");
		try { await onSave(transaction.id, toSheetData(form)); onClose(); } catch (saveError) { setError(saveError.message || "Unable to save the transaction"); setSaving(false); }
	};

	return <Dialog title="Edit transaction" icon={<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f766e] text-white"><Pencil size={17} /></div>} onClose={onClose} busy={saving}><form onSubmit={handleSubmit}>
		<div className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
			<label className="text-sm font-medium text-slate-700">Date <span className="text-rose-600">*</span><input required type="date" name="date" value={form.date} onChange={updateField} className={inputClass} /></label>
			<label className="text-sm font-medium text-slate-700">Amount <span className="text-rose-600">*</span><input required step="0.01" type="number" name="amount" value={form.amount} onChange={updateField} placeholder="-100 or 100" className={inputClass} /><p className={`mt-1.5 text-xs ${transactionType === "debit" ? "text-rose-600" : transactionType === "credit" ? "text-emerald-600" : "text-slate-400"}`}>{transactionType === "debit" ? "Debit transaction" : transactionType === "credit" ? "Credit transaction" : "Negative means debit."}</p></label>
			<label className="text-sm font-medium text-slate-700 sm:col-span-2">Transaction description <span className="text-rose-600">*</span><input required type="text" name="transactionLineDescription" value={form.transactionLineDescription} onChange={updateField} className={inputClass} /></label>
			<label className="text-sm font-medium text-slate-700">Account <span className="text-rose-600">*</span><select required name="account" value={form.account} onChange={updateField} className={`${inputClass} cursor-pointer ${needsAccount ? "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-500/10" : ""}`} autoFocus={needsAccount}><option value="">Select an account</option>{transaction.account && !isUncategorized(transaction) && !assignableAccounts.some(([, account]) => account === transaction.account) && <option value={transaction.account}>{transaction.account}</option>}{assignableAccounts.map(([code, account, type]) => <option key={code} value={account}>{code} - {account} ({type})</option>)}</select>{needsAccount && <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-700"><TriangleAlert size={13} /> {transaction.account ? `Currently "${transaction.account}" — pick a proper account head.` : "This transaction isn't categorised yet."}</p>}</label>
			<label className="text-sm font-medium text-slate-700">Supplier<input type="text" name="supplier" value={form.supplier} onChange={updateField} className={inputClass} /></label>
			<label className="text-sm font-medium text-slate-700 sm:col-span-2">Note<textarea name="note" value={form.note} onChange={updateField} rows="3" className={`${inputClass} h-auto resize-y py-3`} /></label>
		</div>
		<div className="flex flex-col-reverse items-stretch justify-end gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
			{error && <p className="text-sm text-rose-700 sm:mr-auto">{error}</p>}
			<button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
			<button type="submit" disabled={saving} className="flex items-center justify-center gap-2 rounded-lg bg-[#0f766e] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#115e59] disabled:opacity-60">{saving && <LoaderCircle size={15} className="animate-spin" />}{saving ? "Saving..." : "Save changes"}</button>
		</div>
	</form></Dialog>;
}

export function DeleteTransactionDialog({ transaction, onClose, onDelete }) {
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState("");
	const handleDelete = async () => {
		setDeleting(true); setError("");
		try { await onDelete(transaction.id); onClose(); } catch (deleteError) { setError(deleteError.message || "Unable to delete the transaction"); setDeleting(false); }
	};

	return <Dialog title="Delete transaction" icon={<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700"><Trash2 size={17} /></div>} onClose={onClose} busy={deleting}>
		<div className="space-y-3 p-5 text-sm text-slate-600 sm:p-6"><p>This removes the row from the Google Sheet. It can&apos;t be undone from here.</p><div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="font-medium text-slate-800">{transaction.description || "Untitled transaction"}</p><p className="mt-1 text-xs text-slate-500">{transaction.date} · {transaction.type === "credit" ? "+" : "-"}{money(transaction.amount)}{transaction.supplier ? ` · ${transaction.supplier}` : ""}</p></div></div>
		<div className="flex flex-col-reverse items-stretch justify-end gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
			{error && <p className="text-sm text-rose-700 sm:mr-auto">{error}</p>}
			<button type="button" onClick={onClose} disabled={deleting} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
			<button type="button" onClick={handleDelete} disabled={deleting} className="flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60">{deleting && <LoaderCircle size={15} className="animate-spin" />}{deleting ? "Deleting..." : "Delete"}</button>
		</div>
	</Dialog>;
}
