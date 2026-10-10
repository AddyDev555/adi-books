"use client";
import { useEffect, useMemo, useState } from "react";
import FilterBar from "@/components/filter";
import AccountSummary from "./components/accountSummary";
import TransactionsTableView from "./components/transactionsTableView";
import { deleteTransaction, fetchTransactions, updateTransaction } from "@/lib/transactionsApi";

const initialFilters = { search: "", accounts: [], from: "2026-08-01", to: "2026-09-30", type: "", amount: "" };
const normalizeTransaction = (transaction) => {
    const creditAmount = Number(transaction.creditAmount) || 0;
    const debitAmount = Number(transaction.debitAmount) || 0;
    const isCredit = creditAmount > 0;
    return {
        ...transaction,
        description: transaction.transactionLineDescription || "",
        amount: isCredit ? creditAmount : debitAmount,
        type: isCredit ? "credit" : "debit",
    };
};
const extractTransactions = (responseData) => {
    const transactions = Array.isArray(responseData) ? responseData : responseData?.data;
    if (!Array.isArray(transactions)) throw new Error("The API response does not contain a transaction list");
    return transactions;
};

export default function Dashboard() {
    const [transactions, setTransactions] = useState([]);
    const [filters, setFilters] = useState(initialFilters);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadTransactions = async () => {
            try {
                const responseData = await fetchTransactions();
                setTransactions(extractTransactions(responseData).map(normalizeTransaction));
            } catch (fetchError) {
                setError(fetchError.message || "Unable to load transactions");
            } finally {
                setLoading(false);
            }
        };

        loadTransactions();
    }, []);

    const handleUpdate = async (id, data) => {
        const { data: saved } = await updateTransaction(transactions.find((transaction) => transaction.id === id), data);
        setTransactions((current) => current.map((transaction) => transaction.id === id ? normalizeTransaction({ ...transaction, ...data, ...saved }) : transaction));
    };
    // Sheet rows below a deleted one move up, so their row-position ids shift down by one.
    const handleDelete = async (id) => {
        await deleteTransaction(transactions.find((transaction) => transaction.id === id));
        setTransactions((current) => current.filter((transaction) => transaction.id !== id).map((transaction) => transaction.id > id ? { ...transaction, id: transaction.id - 1 } : transaction));
    };

    const accounts = [...new Set(transactions.map((transaction) => transaction.account))];
    const filteredTransactions = useMemo(() => transactions.filter((transaction) => { const query = filters.search.toLowerCase(); const searchable = `${transaction.description} ${transaction.supplier} ${transaction.note}`.toLowerCase(); return (!query || searchable.includes(query)) && (filters.accounts.length === 0 || filters.accounts.includes(transaction.account)) && (!filters.from || transaction.date >= filters.from) && (!filters.to || transaction.date <= filters.to) && (!filters.type || transaction.type === filters.type) && (!filters.amount || transaction.amount === Number(filters.amount)); }), [filters, transactions]);
    return (
        <main className="min-h-screen w-full min-w-0 bg-[#f5f7f7] pt-16 text-slate-900 md:ml-[260px] md:w-[calc(100%-260px)] md:pt-0">
            <div className="mx-auto max-w-[1500px]">
                <FilterBar filters={filters} accounts={accounts} onChange={setFilters} onReset={() => setFilters(initialFilters)} resultCount={filteredTransactions.length} />
                {loading ? <p className="bg-white p-6 text-sm text-slate-500">Loading transactions...</p> : error ? <p className="bg-white p-6 text-sm text-rose-700">{error}</p> : <><AccountSummary transactions={filteredTransactions} /><TransactionsTableView transactions={filteredTransactions} onUpdate={handleUpdate} onDelete={handleDelete} /></>}
            </div>
        </main>
    );
}
