import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon strictly needs raster (PNG) — Safari ignores
// SVG icons. ImageResponse rasterises this JSX at build/request time
// so we get a proper 180×180 PNG without shipping a binary asset.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#2A3A5B",
          color: "#2B944F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 120,
          fontWeight: 700,
          letterSpacing: -4,
          fontFamily: "ui-sans-serif, system-ui",
        }}
      >
        N
      </div>
    ),
    { ...size },
  );
}
