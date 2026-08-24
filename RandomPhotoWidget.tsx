import React from "react";
import { FlexWidget, ImageWidget, TextWidget } from "react-native-android-widget";

export function RandomPhotoWidget({
  imageDataUri,
  imageWidth,
  imageHeight,
  count,
  dateLabel,
}: {
  imageDataUri: `data:image${string}` | null;
  imageWidth: number;
  imageHeight: number;
  count: number;
  dateLabel: string | null;
}) {
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        borderRadius: 20,
        backgroundColor: "#101014",
        overflow: "hidden",
      }}
      clickAction="OPEN_APP"
    >
      <FlexWidget
        style={{
          height: "match_parent",
          width: "match_parent",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {imageDataUri ? (
          <ImageWidget
            image={imageDataUri}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            resizeMode="cover"
            style={{
              height: "match_parent",
              width: "match_parent",
            }}
          />
        ) : (
          <TextWidget
            text={count > 0 ? `${count} photos` : "PhotogramBot"}
            style={{ fontSize: 13, color: "#D6E3FF", fontWeight: "700" }}
          />
        )}
      </FlexWidget>
      <FlexWidget
        style={{
          marginLeft: 10,
          marginBottom: 10,
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 4,
          paddingBottom: 4,
          backgroundColor: "#8E000000",
          borderRadius: 10,
        }}
      >
        <TextWidget
          text={dateLabel ?? "PhotogramBot"}
          style={{ fontSize: 11, color: "#FFFFFF", fontWeight: "600" }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
