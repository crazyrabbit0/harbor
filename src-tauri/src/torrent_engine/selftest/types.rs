use serde::Serialize;

#[derive(Serialize)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct SelfTestResult {
    pub pass: bool,
    pub steps: Vec<SelfTestStep>,
}

#[derive(Serialize, Clone)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct SelfTestStep {
    pub label: String,
    pub ok: bool,
    #[serde(default)]
    pub warn: bool,
    pub detail: String,
}

pub fn step(label: &str, ok: bool, detail: impl Into<String>) -> SelfTestStep {
    SelfTestStep {
        label: label.to_string(),
        ok,
        warn: false,
        detail: detail.into(),
    }
}

pub fn warn_step(label: &str, detail: impl Into<String>) -> SelfTestStep {
    SelfTestStep {
        label: label.to_string(),
        ok: false,
        warn: true,
        detail: detail.into(),
    }
}

pub fn finish(steps: Vec<SelfTestStep>) -> SelfTestResult {
    let pass = steps.iter().all(|s| s.ok || s.warn);
    SelfTestResult { pass, steps }
}
