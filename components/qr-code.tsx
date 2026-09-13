"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, label }: { value: string; label: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { width: 320, margin: 1, color: { dark: "#111113", light: "#ffffff" } })
      .then(setSource)
      .catch(() => setSource(""));
  }, [value]);
  return source ? <Image className="qr" src={source} alt={label} width={320} height={320} unoptimized /> : <div className="qr-placeholder">QR</div>;
}
