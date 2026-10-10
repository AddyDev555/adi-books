"use client";

import { useState } from "react";
import { ArrowLeft, Check, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { chartOfAccounts } from "@/lib/chartOfAccounts";

const today = new Date().toISOString().slice(0, 10);

const initialForm = {
    date: today,
    transactionLineDescription: "",
    amount: "",
    account: "",
    supplier: "",
    note: "",
};

const inputClass = "mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/10";

export default function ManualEntriesPage() {
    const [form, setForm] = useState(initialForm);
    const [submitted, setSubmitted] = useState(false);
    const amount = Number(form.amount);
    const transactionType = amount < 0 ? "debit" : amount > 0 ? "credit" : "";

    const updateField = (event) => {
        const { name, value } = event.target;
        setForm((currentForm) => ({ ...currentForm, [name]: value }));
        setSubmitted(false);
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        if (amount === 0) return;
        setSubmitted(true);
    };

    return (
        <main className="min-h-screen w-full min-w-0 bg-[#eef4f3] px-4 pb-12 pt-20 text-slate-900 md:ml-[260px] md:w-[calc(100%-260px)] md:px-8 md:pt-10">
            <div className="mx-auto">
                <form onSubmit={handleSubmit} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,118,110,0.08)]">
                    <div className="flex items-center gap-4 border-b border-slate-100 bg-gradient-to-r from-[#f0fdfa] to-white px-5 py-5 sm:px-8">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f766e] text-white shadow-sm"><FilePlus2 size={21} /></div>
                        <div>
                            <h2 className="font-semibold text-slate-950">Transaction details</h2>
                            <p className="mt-0.5 text-sm text-slate-500">Fields marked with <span className="text-rose-600">*</span> are required.</p>
                        </div>
                    </div>

                    <div className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 sm:p-8">
                        <label className="text-sm font-medium text-slate-700">
                            Date <span className="text-rose-600">*</span>
                            <input required type="date" name="date" value={form.date} onChange={updateField} className={inputClass} />
                        </label>
                        <label className="text-sm font-medium text-slate-700">
                            Amount <span className="text-rose-600">*</span>
                            <input required min="-999999999" step="0.01" type="number" name="amount" value={form.amount} onChange={updateField} placeholder="-100 or 100" className={inputClass} aria-describedby="amount-help" />
                            <p id="amount-help" className={`mt-1.5 text-xs ${transactionType === "debit" ? "text-rose-600" : transactionType === "credit" ? "text-emerald-600" : "text-slate-400"}`}>{transactionType === "debit" ? "Debit transaction" : transactionType === "credit" ? "Credit transaction" : "Enter a non-zero amount; negative means debit."}</p>
                        </label>
                        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                            Transaction description <span className="text-rose-600">*</span>
                            <input required type="text" name="transactionLineDescription" value={form.transactionLineDescription} onChange={updateField} placeholder="What was this transaction for?" className={inputClass} />
                        </label>
                        <label className="text-sm font-medium text-slate-700">
                            Account <span className="text-rose-600">*</span>
                            <select required name="account" value={form.account} onChange={updateField} className={`${inputClass} cursor-pointer`}>
                                <option value="">Select an account</option>
                                {chartOfAccounts.map(([code, account, type]) => <option key={code} value={account}>{code} - {account} ({type})</option>)}
                            </select>
                        </label>
                        <label className="text-sm font-medium text-slate-700">
                            Supplier
                            <input type="text" name="supplier" value={form.supplier} onChange={updateField} placeholder="Who was paid or received the money?" className={inputClass} />
                        </label>
                        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                            Note
                            <textarea name="note" value={form.note} onChange={updateField} rows="4" placeholder="Add a reference or any extra context" className={`${inputClass} h-auto resize-y py-3`} />
                        </label>
                    </div>

                    <div className="mt-7 flex flex-col-reverse items-stretch justify-end gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
                        {submitted && <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><Check size={16} /> Entry details ready to save.</p>}
                        <button type="submit" className="rounded-lg bg-[#0f766e] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#115e59] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/30">Save entry</button>
                    </div>
                </form>
            </div>
        </main>
    );
}