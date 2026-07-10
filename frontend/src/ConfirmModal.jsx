function ConfirmModal({ open, message, confirmLabel = '나가기', cancelLabel = '취소', onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="confirm-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-modal" role="alertdialog" aria-modal="true">
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="confirm-modal-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="confirm-modal-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
