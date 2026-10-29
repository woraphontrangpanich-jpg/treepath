import { useRef } from 'react'
import { ACCEPTED_EXTENSIONS } from '../../data/parse'
import { Button } from '../primitives'
import { useImport } from './useImport'

export function FilePicker({ children, variant = 'secondary', className }: { children: React.ReactNode; variant?: 'primary' | 'secondary'; className?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const { importFiles } = useImport()
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => {
          void importFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <Button variant={variant} className={className} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  )
}
