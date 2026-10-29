import { useCallback } from 'react'
import { importFile, importSamples } from '../../data/import'
import { suggestLinks } from '../../data/links'
import { isAcceptedFile } from '../../data/parse'
import { plural } from '../../lib/format'
import { useStore } from '../../state/store'
import { useTrees } from '../../state/trees'
import { withAutoLayout } from '../../tree/layout'
import { buildSampleTree } from '../../tree/sample'

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
      // The samples' keys match perfectly, so link them right away (lookup links only).
      const { tables: all, links, addLink } = useStore.getState()
      for (const s of suggestLinks(all, links)) if (s.stats.matchRate === 1) addLink({ from: s.from, to: s.to })
      // A finished tree too, so Build and Forecast work straight away.
      const sample = useTrees.getState().trees.length === 0 ? buildSampleTree(useStore.getState().tables) : null
      if (sample) useTrees.getState().newTree(await withAutoLayout(sample))
      notify('info', `Loaded ${plural(tables.length, 'sample table')}${sample ? ' and a ready-made Net Revenue tree' : ''}.`, sample ? { label: 'Open it', run: () => useStore.getState().setWorkspace('build') } : undefined)
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not load samples')
    } finally {
      setBusy(null)
    }
  }, [addTables, setBusy, notify])

  return { importFiles, loadSamples }
}
