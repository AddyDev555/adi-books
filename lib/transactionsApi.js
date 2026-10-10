export const API_URL = "https://script.google.com/macros/s/AKfycbxd_f1NSXAqVQzfrpp_zkjhMvxawsqDPLkow6BbP_FwAWN4l0-iHO0Rd9kGnXtFyUjO/exec";

// Apps Script intermittently answers with a "Page not found" 404 that succeeds on retry.
export const fetchTransactions = async (attempts = 3) => {
	for (let attempt = 1; ; attempt++) {
		const response = await fetch(`${API_URL}?limit=500`);
		if (response.ok) return response.json();
		if (attempt >= attempts) throw new Error(`Request failed with status ${response.status}`);
		await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
	}
};

// Apps Script web apps don't answer CORS preflights, so the body is sent as text/plain
// (a "simple" request) and parsed with JSON.parse(e.postData.contents) in doPost.
const postAction = async (payload) => {
	const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
	if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
	const text = await response.text();
	let result;
	try { result = JSON.parse(text); } catch { throw new Error("Unexpected response from the Google Apps Script backend"); }
	if (!result?.success) throw new Error(result?.error || result?.message || "The sheet could not be updated");
	return result;
};

// ids are row positions in the sheet, so the script checks the row still holds this transaction before writing.
const expectedRow = (transaction) => ({ date: transaction.date, transactionLineDescription: transaction.transactionLineDescription, creditAmount: transaction.creditAmount, debitAmount: transaction.debitAmount });

export const updateTransaction = (transaction, data) => postAction({ action: "update", id: transaction.id, expected: expectedRow(transaction), data });
export const deleteTransaction = (transaction) => postAction({ action: "delete", id: transaction.id, expected: expectedRow(transaction) });
