import { useCallback } from 'react'
import { importFile, importSamples } from '../../data/import'
import { isAcceptedFile } from '../../data/parse'
import { plural } from '../../lib/format'
import { useStore } from '../../state/store'

export function useImport() {
  const { addTables, setBusy, notify } = useStore.getState()

  const importFiles = useCallback(
    async (files: File[]) => {
      const accepted = files.filter((f) => isAcceptedFile(f.name))
      const rejected = files.filter((f) => !isAcceptedFile(f.name))
      for (const f of rejected) notify('error', `${f.name}: unsupported file type. Use .xlsx, .xls, .csv, .tsv or .ods.`)
      if (accepted.length === 0) return
      let total = 0
      for (const file of accepted) {
        setBusy(`Reading ${file.name}…`)
        try {
          const tables = await importFile(file)
          if (tables.length === 0) notify('error', `${file.name}: no rows found. The first row should be column headers.`)
          else {
            addTables(tables)
            total += tables.length
          }
        } catch (err) {
          notify('error', `${file.name}: ${err instanceof Error ? err.message : 'could not be read'}`)
        }
      }
      setBusy(null)
      if (total) notify('info', `Imported ${plural(total, 'table')} from ${plural(accepted.length, 'file')}.`)
    },
    [addTables, setBusy, notify],
  )

  const loadSamples = useCallback(async () => {
    setBusy('Loading sample workbooks…')
    try {
      const tables = await importSamples()
      addTables(tables)
      notify('info', `Loaded ${plural(tables.length, 'sample table')}.`)
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not load samples')
    } finally {
      setBusy(null)
    }
  }, [addTables, setBusy, notify])

  return { importFiles, loadSamples }
}
