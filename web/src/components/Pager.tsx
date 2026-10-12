import { useTranslation } from 'react-i18next'
import { formatNumber } from '../lib/format'

type PagerProps = {
  page: number
  pageSize: number
  shown: number
  total: number
  onPage: (page: number) => void
}

// "1 to 50 of 3,767" with Previous and Next buttons.
export function Pager({ page, pageSize, shown, total, onPage }: PagerProps) {
  const { t, i18n } = useTranslation()
  const from = (page - 1) * pageSize + 1
  const to = from + shown - 1
  const lastPage = Math.ceil(total / pageSize)
  const buttonClass = 'rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 disabled:opacity-40'

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-gray-700">
        {t('common.pager.count', {
          from: formatNumber(from, i18n.language),
          to: formatNumber(to, i18n.language),
          total: formatNumber(total, i18n.language),
        })}
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={buttonClass}>
          {t('common.pager.previous')}
        </button>
        <button type="button" disabled={page >= lastPage} onClick={() => onPage(page + 1)} className={buttonClass}>
          {t('common.pager.next')}
        </button>
      </div>
    </div>
  )
}
