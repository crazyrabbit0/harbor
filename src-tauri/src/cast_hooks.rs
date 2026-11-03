//! Builds the `CastHooks` that `harbor-cast` reaches app code through.
use crate::stream_proxy::ProxyState;
use harbor_shared::cast_hooks::CastHooks;
use std::sync::Arc;

pub(crate) fn build(proxy: ProxyState) -> CastHooks {
    let (register, audio, input, stop) = (proxy.clone(), proxy.clone(), proxy.clone(), proxy);
    CastHooks {
        register_cast: Arc::new(move |args| {
            let proxy = register.clone();
            Box::pin(async move { proxy.register_cast(args).await })
        }),
        register_audio_cast: Arc::new(move |input| {
            let proxy = audio.clone();
            Box::pin(async move { proxy.register_audio_cast(input).await })
        }),
        audio_cast_input: Arc::new(move |id| {
            let proxy = input.clone();
            Box::pin(async move { proxy.audio_cast_input(&id).await })
        }),
        stop_hls_session: Arc::new(move |id| {
            let proxy = stop.clone();
            Box::pin(async move { proxy.stop_hls_session(&id).await })
        }),
        prepare_sub: Arc::new(|sub, style, url, headers, seek| {
            Box::pin(
                async move { crate::cast_subs::prepare(&sub, &style, &url, &headers, seek).await },
            )
        }),
        cleanup_subs: Arc::new(crate::cast_subs::cleanup),
        ffmpeg_present: Arc::new(crate::transcode::ffmpeg_present),
        locate_ffmpeg: Arc::new(crate::transcode::locate_ffmpeg),
    }
}
