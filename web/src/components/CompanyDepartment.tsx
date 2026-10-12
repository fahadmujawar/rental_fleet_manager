import { useTranslation } from 'react-i18next'
import type { CustomerRef } from '../machines/types'
import { SisterBadge } from './SisterBadge'

// Company / Department: the customer the machine is with. No customer means the machine is
// with the user's own company (the import stores Company / Department "TCS" as no customer).
export function CompanyDepartment({ customer, companyCode }: { customer: CustomerRef | null; companyCode?: string }) {
  const { t } = useTranslation()

  if (customer) {
    return (
      <>
        {customer.name}
        {customer.is_sister_company && <SisterBadge />}
      </>
    )
  }
  if (companyCode) return <bdi dir="ltr">{companyCode}</bdi>
  return <span className="text-gray-400">{t('common.notSet')}</span>
}
