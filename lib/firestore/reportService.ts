/**
 * Saved report summaries at users/{uid}/reports/{id}. Reports are immutable (create and
 * delete only) and never store time series: reportToData whitelists SavedReport fields, so a
 * `series` (or any other extra key) on the input is dropped before the write.
 */
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import type { SavedReport } from "@/lib/model/types";
import { COLLECTIONS } from "./collections";
import { reportToData, savedReportConverter, type SavedReportInput } from "./converters";

export type { SavedReportInput } from "./converters";

function reportsCol(uid: string) {
  return collection(getDb(), COLLECTIONS.users, uid, "reports");
}

/** Saves the summary and returns the new report id. */
export async function saveReportSummary(uid: string, report: SavedReportInput): Promise<string> {
  const ref = await addDoc(reportsCol(uid), reportToData(report));
  return ref.id;
}

/** Newest first. */
export async function listReports(uid: string): Promise<SavedReport[]> {
  const snap = await getDocs(query(reportsCol(uid), orderBy("createdAt", "desc")).withConverter(savedReportConverter));
  return snap.docs.map((d) => d.data());
}

export async function deleteReport(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(reportsCol(uid), id));
}
