const DEFAULT_ENROLMENT_EN_FEE_VARIANCE_THRESHOLD = 20;

let enrolmentEnFeeVarianceThreshold = DEFAULT_ENROLMENT_EN_FEE_VARIANCE_THRESHOLD;

export function getEnrolmentEnFeeVarianceThreshold(): number {
  return enrolmentEnFeeVarianceThreshold;
}

export function setEnrolmentEnFeeVarianceThreshold(value: unknown): void {
  const parsed = typeof value === 'number' ? value : Number(value);
  enrolmentEnFeeVarianceThreshold = Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_ENROLMENT_EN_FEE_VARIANCE_THRESHOLD;
}
