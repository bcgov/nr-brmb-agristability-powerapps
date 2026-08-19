// Static imports so Vite processes all app-switcher icons into dist/assets/
// (files referenced only via string paths in public/ are not bundled by npx power-apps push).
import appCoreCrmDevUrl    from '../icons/app-core-crm-dev.jpg';
import appCoreCrmTestUrl   from '../icons/app-core-crm-test.jpg';
import appCoreCrmProdUrl   from '../icons/app-core-crm-prod.jpg';
import appFinanceDevUrl    from '../icons/app-finance-dev.png';
import appFinanceTestUrl   from '../icons/app-finance-test.png';
import appFinanceProdUrl   from '../icons/app-finance-prod.png';
import appEnrollmentDevUrl  from '../icons/app-enrollment-sm-dev.jpg';
import appEnrollmentTestUrl from '../icons/app-enrollment-sm-test.jpg';
import appEnrollmentProdUrl from '../icons/app-enrollment-sm-prod.jpg';
import appChangeMgmtDevUrl  from '../icons/app-code-management-sm-dev.jpg';
import appChangeMgmtTestUrl from '../icons/app-code-management-sm-test.jpg';
import appChangeMgmtProdUrl from '../icons/app-code-management-sm-prod.jpg';
import appFarmsDevUrl      from '../icons/app-farms-dev.jpg';
import appFarmsTestUrl     from '../icons/app-farms-test.jpg';
import appFarmsProdUrl     from '../icons/app-farms-prod.jpg';

export const ICON_ASSET_URLS: Record<string, string> = {
  '/icons/app-core-crm-dev.jpg':            appCoreCrmDevUrl,
  '/icons/app-core-crm-test.jpg':           appCoreCrmTestUrl,
  '/icons/app-core-crm-prod.jpg':           appCoreCrmProdUrl,
  '/icons/app-finance-dev.png':             appFinanceDevUrl,
  '/icons/app-finance-test.png':            appFinanceTestUrl,
  '/icons/app-finance-prod.png':            appFinanceProdUrl,
  '/icons/app-enrollment-sm-dev.jpg':       appEnrollmentDevUrl,
  '/icons/app-enrollment-sm-test.jpg':      appEnrollmentTestUrl,
  '/icons/app-enrollment-sm-prod.jpg':      appEnrollmentProdUrl,
  '/icons/app-code-management-sm-dev.jpg':  appChangeMgmtDevUrl,
  '/icons/app-code-management-sm-test.jpg': appChangeMgmtTestUrl,
  '/icons/app-code-management-sm-prod.jpg': appChangeMgmtProdUrl,
  '/icons/app-farms-dev.jpg':               appFarmsDevUrl,
  '/icons/app-farms-test.jpg':              appFarmsTestUrl,
  '/icons/app-farms-prod.jpg':              appFarmsProdUrl,
};
