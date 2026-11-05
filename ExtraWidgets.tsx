import React from "react";
import { FlexWidget, ImageWidget, TextWidget } from "react-native-android-widget";

export function OnThisDayWidget({
  imageDataUri,
  imageWidth,
  imageHeight,
  label,
  photoId,
}: {
  imageDataUri: `data:image${string}` | null;
  imageWidth: number;
  imageHeight: number;
  label: string;
  photoId: string | null;
}) {
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        justifyContent: "flex-end",
        borderRadius: 20,
        backgroundColor: "#101014",
        overflow: "hidden",
      }}
      clickAction={photoId ? `photogrambot://photo/${photoId}` : "OPEN_APP"}
    >
      {imageDataUri ? (
        <ImageWidget
          image={imageDataUri}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          resizeMode="cover"
          style={{ height: "match_parent", width: "match_parent" }}
        />
      ) : (
        <FlexWidget
          style={{
            height: "match_parent",
            width: "match_parent",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <TextWidget
            text="On this day"
            style={{ fontSize: 13, color: "#D6E3FF", fontWeight: "700" }}
          />
        </FlexWidget>
      )}
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
        <TextWidget text={label} style={{ fontSize: 11, color: "#FFFFFF", fontWeight: "600" }} />
      </FlexWidget>
    </FlexWidget>
  );
}

export function MosaicWidget({
  images,
  width,
  height,
}: {
  images: { dataUri: `data:image${string}` | null; photoId: string | null }[];
  width: number;
  height: number;
}) {
  const cellW = Math.max(1, Math.floor(width / 2));
  const cellH = Math.max(1, Math.floor(height / 2));
  const cells = Array.from({ length: 4 }, (_, i) => images[i] ?? null);
  const renderCell = (cell: (typeof cells)[number], i: number) => (
    <FlexWidget
      key={i}
      style={{ width: cellW, height: cellH }}
      clickAction={cell?.photoId ? `photogrambot://photo/${cell.photoId}` : "OPEN_APP"}
    >
      {cell?.dataUri ? (
        <ImageWidget
          image={cell.dataUri}
          imageWidth={cellW}
          imageHeight={cellH}
          resizeMode="cover"
          style={{ width: cellW, height: cellH }}
        />
      ) : (
        <FlexWidget
          style={{
            width: cellW,
            height: cellH,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#1B1B1F",
          }}
        >
          <TextWidget text="•" style={{ color: "#5A5A66", fontSize: 18 }} />
        </FlexWidget>
      )}
    </FlexWidget>
  );
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        borderRadius: 20,
        backgroundColor: "#101014",
        overflow: "hidden",
      }}
      clickAction="OPEN_APP"
    >
      <FlexWidget style={{ flexDirection: "row", width: "match_parent", height: cellH }}>
        {renderCell(cells[0], 0)}
        {renderCell(cells[1], 1)}
      </FlexWidget>
      <FlexWidget style={{ flexDirection: "row", width: "match_parent", height: cellH }}>
        {renderCell(cells[2], 2)}
        {renderCell(cells[3], 3)}
      </FlexWidget>
    </FlexWidget>
  );
}

export function SlideshowWidget({
  imageDataUri,
  imageWidth,
  imageHeight,
  photoId,
  width,
  height,
}: {
  imageDataUri: `data:image${string}` | null;
  imageWidth: number;
  imageHeight: number;
  photoId: string | null;
  width: number;
  height: number;
}) {
  const imageHeightPx = Math.max(1, Math.floor(height * 0.74));
  const footerHeight = Math.max(28, height - imageHeightPx);
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        borderRadius: 20,
        backgroundColor: "#101014",
        overflow: "hidden",
      }}
      clickAction="photogrambot://slideshow"
    >
      <FlexWidget
        style={{
          width: "match_parent",
          height: imageHeightPx,
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
            style={{ height: "match_parent", width: "match_parent" }}
          />
        ) : (
          <TextWidget text="▶" style={{ color: "#D6E3FF", fontSize: 28 }} />
        )}
      </FlexWidget>
      <FlexWidget
        style={{
          width: "match_parent",
          height: footerHeight,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#1B1B1F",
        }}
      >
        <TextWidget
          text={photoId ? "▶  Slideshow" : "No photos yet"}
          style={{ fontSize: 11, color: "#FFFFFF", fontWeight: "600" }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

export function QuickCaptureWidget({ accent }: { accent: string }) {
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 20,
        backgroundColor: "#101014",
      }}
      clickAction="photogrambot://capture"
    >
      <FlexWidget
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: accent as any,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <TextWidget text="+" style={{ color: "#FFFFFF", fontSize: 30, fontWeight: "700" }} />
      </FlexWidget>
      <TextWidget
        text="Capture"
        style={{ color: "#D6E3FF", fontSize: 12, fontWeight: "600" }}
      />
    </FlexWidget>
  );
}
