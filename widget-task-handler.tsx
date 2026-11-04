import React from "react";
import { Linking } from "react-native";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { RandomPhotoWidget } from "./RandomPhotoWidget";
import { getRandomPhotoForWidget } from "./widgetData";

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetInfo = props.widgetInfo;
  const { width, height } = widgetInfo;

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      const data = await getRandomPhotoForWidget();
      // Widget appearance prefs are read here so the headless render honours
      // Settings → Appearance. A missing prefs read falls back to defaults.
      let showDate = true;
      let forceCompact = false;
      try {
        const { loadPrefs } = await import("./src/lib/settings");
        const prefs = await loadPrefs();
        showDate = prefs.widgetShowDate;
        forceCompact = prefs.widgetCompact;
      } catch {}
      const compact = forceCompact || width < 180 || height < 150;
      const dateLabel = showDate && data?.takenAt
        ? new Date(data.takenAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : null;
      props.renderWidget(
        <RandomPhotoWidget
          imageDataUri={data?.imageDataUri ?? null}
          imageWidth={data?.imageWidth ?? 200}
          imageHeight={data?.imageHeight ?? 200}
          count={data?.count ?? 0}
          dateLabel={dateLabel}
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
