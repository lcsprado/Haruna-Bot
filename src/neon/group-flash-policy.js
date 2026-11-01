// Eligibility for current, economic group flash events must not be tied to
// TEMPORARY_* historical data recovery mode. Only the introduction remains gated.
export function groupFlashPolicy({isGroup=false,temporaryRecoveryMode=false}={}){
  return Object.freeze({
    allowFlashEvent:Boolean(isGroup),
    allowGroupIntro:Boolean(isGroup&&!temporaryRecoveryMode)
  })
}
