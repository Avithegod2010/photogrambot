import React from "react";
import { Linking } from "react-native";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { RandomPhotoWidget } from "./RandomPhotoWidget";
import { OnThisDayWidget, MosaicWidget, QuickCaptureWidget } from "./ExtraWidgets";
import {
  getMosaicForWidget,
  getOnThisDayForWidget,
  getRandomPhotoForWidget,
} from "./widgetData";

function dateLabel(ts: number | null, withYear = true): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetInfo = props.widgetInfo;
  const { width, height } = widgetInfo;
  const widgetName = widgetInfo.widgetName;

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      let showDate = true;
      let forceCompact = false;
      let accent = "#4C8DFF";
      try {
        const { loadPrefs } = await import("./src/lib/settings");
        const prefs = await loadPrefs();
        showDate = prefs.widgetShowDate;
        forceCompact = prefs.widgetCompact;
        if (/^#[0-9a-f]{6}$/i.test(prefs.accentColor)) accent = prefs.accentColor;
      } catch {}
      const compact = forceCompact || width < 180 || height < 150;

      if (widgetName === "OnThisDay") {
        const data = await getOnThisDayForWidget();
        const label = data?.takenAt
          ? data.yearsAgo > 0
            ? `${data.yearsAgo} year${data.yearsAgo === 1 ? "" : "s"} ago`
            : "On this day"
          : "On this day";
        props.renderWidget(
          <OnThisDayWidget
            imageDataUri={data?.imageDataUri ?? null}
            imageWidth={data?.imageWidth ?? 200}
            imageHeight={data?.imageHeight ?? 200}
            label={label}
            photoId={data?.photoId ?? null}
          />
        );
        break;
      }

      if (widgetName === "Mosaic") {
        const photos = await getMosaicForWidget();
        props.renderWidget(
          <MosaicWidget
            width={width}
            height={height}
            images={photos.map((p) => ({ dataUri: p.imageDataUri, photoId: p.photoId }))}
          />
        );
        break;
      }

      if (widgetName === "QuickCapture") {
        props.renderWidget(<QuickCaptureWidget accent={accent} />);
        break;
      }

      const data = await getRandomPhotoForWidget();
      const label = showDate ? dateLabel(data?.takenAt ?? null) : null;
      props.renderWidget(
        <RandomPhotoWidget
          imageDataUri={data?.imageDataUri ?? null}
          imageWidth={data?.imageWidth ?? 200}
          imageHeight={data?.imageHeight ?? 200}
          count={data?.count ?? 0}
          dateLabel={label}
          photoId={data?.photoId ?? null}
          showDate={showDate}
          compact={compact}
        />
      );
      break;
    }
    case "WIDGET_CLICK": {
      const url =
        props.clickAction && props.clickAction.startsWith("photogrambot://")
          ? props.clickAction
          : "photogrambot://open";
      try {
        await Linking.openURL(url);
      } catch {}
      break;
    }
    case "WIDGET_DELETED":
    default:
      break;
  }
}
