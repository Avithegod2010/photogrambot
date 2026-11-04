import React from "react";
import { FlexWidget, ImageWidget, TextWidget } from "react-native-android-widget";

export function RandomPhotoWidget({
  imageDataUri,
  imageWidth,
  imageHeight,
  count,
  dateLabel,
  photoId,
  showDate = true,
  compact = false,
}: {
  imageDataUri: `data:image${string}` | null;
  imageWidth: number;
  imageHeight: number;
  count: number;
  dateLabel: string | null;
  photoId: string | null;
  showDate?: boolean;
  compact?: boolean;
}) {
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        justifyContent: "flex-end",
        alignItems: "flex-start",
        borderRadius: compact ? 12 : 20,
        backgroundColor: "#101014",
        overflow: "hidden",
      }}
      clickAction={photoId ? `photogrambot://photo/${photoId}` : "OPEN_APP"}
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
            style={{ fontSize: compact ? 11 : 13, color: "#D6E3FF", fontWeight: "700" }}
          />
        )}
      </FlexWidget>
      {showDate ? (
        <FlexWidget
          style={{
            marginLeft: compact ? 6 : 10,
            marginBottom: compact ? 6 : 10,
            paddingLeft: compact ? 7 : 10,
            paddingRight: compact ? 7 : 10,
            paddingTop: compact ? 2 : 4,
            paddingBottom: compact ? 2 : 4,
            backgroundColor: "#8E000000",
            borderRadius: compact ? 7 : 10,
          }}
        >
          <TextWidget
            text={dateLabel ?? "PhotogramBot"}
            style={{ fontSize: compact ? 9 : 11, color: "#FFFFFF", fontWeight: "600" }}
          />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}
