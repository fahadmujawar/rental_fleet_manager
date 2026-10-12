import { useTranslation } from 'react-i18next'

export function SisterBadge() {
  const { t } = useTranslation()

  return (
    <span className="ms-2 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs whitespace-nowrap text-blue-800">
      {t('common.sisterCompany')}
    </span>
  )
}
