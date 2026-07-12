import { useState } from 'react'
import { ChevronDownIcon } from './icons'
import './CertSelect.css'

function CertSelect({ certificates, value, onChange, menuPlacement = 'bottom' }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="cert-select">
      <button type="button" className="cert-select-trigger" onClick={() => setOpen((v) => !v)}>
        <span>{value}</span>
        <ChevronDownIcon size={13} />
      </button>

      {open && (
        <div className={`cert-select-menu${menuPlacement === 'top' ? ' cert-select-menu-top' : ''}`}>
          {certificates.map((certificate) => (
            <button
              key={certificate.id}
              type="button"
              className={`cert-select-option${certificate.title === value ? ' active' : ''}`}
              onClick={() => {
                onChange(certificate)
                setOpen(false)
              }}
            >
              {certificate.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default CertSelect
