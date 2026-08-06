import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

/** Compte le nombre de pages d’un PDF (URL signée ou buffer). */
export async function countPdfPages(source: string | ArrayBuffer): Promise<number> {
  const loadingTask = getDocument(
    typeof source === 'string' ? { url: source, withCredentials: false } : { data: source },
  )
  const pdf = await loadingTask.promise
  return pdf.numPages
}
