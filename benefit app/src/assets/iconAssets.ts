// Static imports so Vite bundles all app-switcher icons into dist/assets/.
import appCoreCrmDevUrl        from '../icons/app-core-crm-dev.jpg';
import appCoreCrmTestUrl       from '../icons/app-core-crm-test.jpg';
import appCoreCrmProdUrl       from '../icons/app-core-crm-prod.jpg';
import appFinanceDevUrl        from '../icons/app-finance-dev.png';
import appFinanceTestUrl       from '../icons/app-finance-test.png';
import appFinanceProdUrl       from '../icons/app-finance-prod.png';
import appEnrollmentDevUrl     from '../icons/app-enrollment-sm-dev.jpg';
import appEnrollmentTestUrl    from '../icons/app-enrollment-sm-test.jpg';
import appEnrollmentProdUrl    from '../icons/app-enrollment-sm-prod.jpg';
import appChangeMgmtDevUrl     from '../icons/app-code-management-sm-dev.jpg';
import appChangeMgmtTestUrl    from '../icons/app-code-management-sm-test.jpg';
import appChangeMgmtProdUrl    from '../icons/app-code-management-sm-prod.jpg';
import appFarmsDevUrl          from '../icons/app-farms-dev.jpg';
import appFarmsTestUrl         from '../icons/app-farms-test.jpg';
import appFarmsProdUrl         from '../icons/app-farms-prod.jpg';
import appBenefitDevUrl        from '../icons/app-benefit-sm-dev.jpg';
import appBenefitTestUrl       from '../icons/app-benefit-sm-test.jpg';
import appBenefitProdUrl       from '../icons/app-benefit-sm-prod.jpg';

export type EnvKey = 'dev' | 'test' | 'prod';

export const APP_ICONS: Record<string, Record<EnvKey, string>> = {
  'core-crm':          { dev: appCoreCrmDevUrl,     test: appCoreCrmTestUrl,     prod: appCoreCrmProdUrl },
  'finance':           { dev: appFinanceDevUrl,     test: appFinanceTestUrl,     prod: appFinanceProdUrl },
  'enrollment-app':    { dev: appEnrollmentDevUrl,  test: appEnrollmentTestUrl,  prod: appEnrollmentProdUrl },
  'change-management': { dev: appChangeMgmtDevUrl,  test: appChangeMgmtTestUrl,  prod: appChangeMgmtProdUrl },
  'farms':             { dev: appFarmsDevUrl,       test: appFarmsTestUrl,       prod: appFarmsProdUrl },
  'benefit-app':       { dev: appBenefitDevUrl,     test: appBenefitTestUrl,     prod: appBenefitProdUrl },
};
