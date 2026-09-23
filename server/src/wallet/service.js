const crypto = require("crypto");
const { getDb } = require("../db/client");
const config = require("../config");

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function getWallet(userId) {
  const db = getDb();
  let row = db.prepare("SELECT * FROM wallets WHERE user_id = ?").get(userId);
  if (!row) {
    db.prepare(
      "INSERT INTO wallets (user_id, balance, currency) VALUES (?, ?, ?)"
    ).run(userId, config.startingBalance, config.currency);
    row = db.prepare("SELECT * FROM wallets WHERE user_id = ?").get(userId);
  }
  return row;
}

function appendLedger(db, { userId, type, amount, balanceAfter, refType, refId, meta }) {
  db.prepare(
    `INSERT INTO ledger (id, user_id, type, amount, balance_after, currency, ref_type, ref_id, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    userId,
    type,
    amount,
    balanceAfter,
    config.currency,
    refType || null,
    refId || null,
    meta ? JSON.stringify(meta) : null
  );
}

function debit(userId, amount, ref) {
  amount = money(amount);
  if (amount <= 0) throw Object.assign(new Error("Invalid debit"), { status: 400 });
  const db = getDb();
  const tx = db.transaction(() => {
    const w = getWallet(userId);
    if (w.balance + 1e-9 < amount) {
      const err = new Error("Insufficient balance");
      err.status = 402;
      throw err;
    }
    const next = money(w.balance - amount);
    db.prepare(
      "UPDATE wallets SET balance = ?, updated_at = datetime('now') WHERE user_id = ?"
    ).run(next, userId);
    appendLedger(db, {
      userId,
      type: ref.type || "debit",
      amount: -amount,
      balanceAfter: next,
      refType: ref.refType,
      refId: ref.refId,
      meta: ref.meta
    });
    return next;
  });
  return tx();
}

function credit(userId, amount, ref) {
  amount = money(amount);
  if (amount < 0) throw Object.assign(new Error("Invalid credit"), { status: 400 });
  if (amount === 0) return getWallet(userId).balance;
  const db = getDb();
  const tx = db.transaction(() => {
    const w = getWallet(userId);
    const next = money(w.balance + amount);
    db.prepare(
      "UPDATE wallets SET balance = ?, updated_at = datetime('now') WHERE user_id = ?"
    ).run(next, userId);
    appendLedger(db, {
      userId,
      type: ref.type || "credit",
      amount,
      balanceAfter: next,
      refType: ref.refType,
      refId: ref.refId,
      meta: ref.meta
    });
    return next;
  });
  return tx();
}

function getBalance(userId) {
  return money(getWallet(userId).balance);
}

function listLedger(userId, limit = 50) {
  return getDb()
    .prepare(
      "SELECT id, type, amount, balance_after, ref_type, ref_id, created_at FROM ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(userId, limit);
}

module.exports = {
  getWallet,
  getBalance,
  debit,
  credit,
  listLedger,
  money
};
