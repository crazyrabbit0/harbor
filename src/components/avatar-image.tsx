import { useState } from "react";
import { CatAvatar } from "@/components/icons/cat-avatar";

export function AvatarImage({ src, className }: { src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [seenSrc, setSeenSrc] = useState(src);
  if (seenSrc !== src) {
    setSeenSrc(src);
    setFailed(false);
  }

  if (!src || failed) return <CatAvatar className={className} />;

  return (
    <img src={src} alt="" draggable={false} className={className} onError={() => setFailed(true)} />
  );
}
