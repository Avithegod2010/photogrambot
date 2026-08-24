import React from "react";
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
      const dateLabel = data?.takenAt
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
        />
      );
      break;
    }
    case "WIDGET_DELETED":
    case "WIDGET_CLICK":
    default:
      break;
  }
}
