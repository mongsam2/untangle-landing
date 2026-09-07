"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import {
  track,
  type AnalyticsEvent,
  type AnalyticsProps,
} from "@/lib/analytics";

/**
 * next/link 위에 클릭 이벤트 기록을 얹은 링크. 클라이언트 전환은 페이지를
 * 언로드하지 않으므로 track() 이 정상적으로 flush된다.
 *
 * 서버 컴포넌트(Header 등)나 shared 컴포넌트(CtaButton)에서 이 클라이언트
 * 컴포넌트를 렌더해 CTA 클릭의 단일 계측 지점으로 쓴다.
 */
type Props = ComponentProps<typeof Link> & {
  event: AnalyticsEvent;
  eventProps?: AnalyticsProps;
};

export function TrackedLink({
  event,
  eventProps,
  onClick,
  ...linkProps
}: Props) {
  return (
    <Link
      {...linkProps}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        track(event, eventProps);
        onClick?.(e);
      }}
    />
  );
}
