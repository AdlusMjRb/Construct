import exifr from "exifr";

function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 2) return NaN;
  const d = dms[0] || 0;
  const m = dms[1] || 0;
  const s = dms[2] || 0;
  let decimal = d + m / 60 + s / 3600;
  if (ref === "S" || ref === "W") decimal = -decimal;
  return decimal;
}

let c2paLoaded = null;
async function loadC2PA() {
  if (c2paLoaded !== null) return c2paLoaded;
  try {
    const { JPEG, PNG, BMFF } = await import("@trustnxt/c2pa-ts/asset");
    const { ManifestStore } = await import("@trustnxt/c2pa-ts/manifest");
    const { SuperBox } = await import("@trustnxt/c2pa-ts/jumbf");
    c2paLoaded = { JPEG, PNG, BMFF, ManifestStore, SuperBox };
    console.log("   ✅ C2PA reader loaded (c2pa-ts)");
    return c2paLoaded;
  } catch (err) {
    console.log(
      `   ⚠️  C2PA not available: ${err.message} (install @trustnxt/c2pa-ts to enable)`,
    );
    c2paLoaded = false;
    return false;
  }
}

let rdClient = null;
async function loadRealityDefender() {
  if (rdClient !== null) return rdClient;
  const apiKey = process.env.REALITY_DEFENDER_API_KEY;
  if (!apiKey) {
    console.log("   ⚠️  Reality Defender API key not configured — skipping");
    rdClient = false;
    return false;
  }
  try {
    const { RealityDefender } =
      await import("@realitydefender/realitydefender");
    rdClient = new RealityDefender({ apiKey });
    console.log("   ✅ Reality Defender SDK loaded");
    return rdClient;
  } catch (err) {
    console.log(`   ⚠️  Reality Defender SDK not available: ${err.message}`);
    rdClient = false;
    return false;
  }
}

export async function checkExif(buffer, mediaType) {
  const result = {
    layer: "exif",
    status: "unknown",
    camera: null,
    gps: null,
    timestamp: null,
    software: null,
    signals: [],
    raw: null,
  };

  try {
    const exif = await exifr.parse(buffer, {
      gps: true,
      ifd0: true,
      exif: true,
      iptc: true,
      xmp: true,
    });

    if (!exif) {
      result.status = "no_data";
      result.signals.push(
        "No EXIF metadata found — common in AI-generated images, screenshots, or heavily processed photos",
      );
      return result;
    }

    result.raw = exif;

    if (exif.Make || exif.Model) {
      result.camera = {
        make: exif.Make || null,
        model: exif.Model || null,
        lens: exif.LensModel || exif.LensMake || null,
      };
      result.signals.push(
        `Camera: ${exif.Make || "?"} ${exif.Model || "unknown"}`,
      );
    } else {
      result.signals.push("No camera make/model — suspicious for a photo");
    }

    let lat = exif.latitude;
    let lon = exif.longitude;

    if ((lat === undefined || isNaN(lat)) && exif.GPSLatitude) {
      lat = dmsToDecimal(exif.GPSLatitude, exif.GPSLatitudeRef);
    }
    if ((lon === undefined || isNaN(lon)) && exif.GPSLongitude) {
      lon = dmsToDecimal(exif.GPSLongitude, exif.GPSLongitudeRef);
    }

    if (
      lat !== undefined &&
      lon !== undefined &&
      !isNaN(lat) &&
      !isNaN(lon) &&
      !(lat === 0 && lon === 0)
    ) {
      result.gps = {
        latitude: lat,
        longitude: lon,
        altitude: exif.GPSAltitude || null,
      };
      result.signals.push(`GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    }

    if (exif.DateTimeOriginal || exif.CreateDate) {
      const ts = exif.DateTimeOriginal || exif.CreateDate;
      result.timestamp = ts instanceof Date ? ts.toISOString() : String(ts);
      result.signals.push(`Capture date: ${result.timestamp}`);
    }

    if (exif.Software) {
      result.software = exif.Software;
      const suspicious =
        /photoshop|gimp|canva|midjourney|dalle|stable.?diffusion/i;
      if (suspicious.test(exif.Software)) {
        result.signals.push(
          `⚠️ Edited with: ${exif.Software} — may indicate manipulation`,
        );
      } else {
        result.signals.push(`Software: ${exif.Software}`);
      }
    }

    const hasCamera = !!result.camera;
    const hasTimestamp = !!result.timestamp;
    const hasGps = !!result.gps;
    const hasSuspiciousSoftware =
      result.software &&
      /photoshop|gimp|canva|midjourney|dalle|stable.?diffusion/i.test(
        result.software,
      );

    if (hasSuspiciousSoftware) {
      result.status = "suspicious";
    } else if (hasCamera && hasTimestamp) {
      result.status = "authentic";
    } else if (hasCamera || hasTimestamp || hasGps) {
      result.status = "authentic";
    } else {
      result.status = "suspicious";
      result.signals.push(
        "Minimal EXIF — no camera, no timestamp. Possible screenshot or AI-generated.",
      );
    }
  } catch (err) {
    result.status = "error";
    result.signals.push(`EXIF parsing error: ${err.message}`);
  }

  return result;
}

export async function checkC2PA(buffer, mediaType) {
  const result = {
    layer: "c2pa",
    status: "unknown",
    signer: null,
    claimGenerator: null,
    assertions: [],
    signals: [],
  };

  const c2pa = await loadC2PA();
  if (!c2pa) {
    result.status = "unavailable";
    result.signals.push(
      "C2PA library not installed — provenance verification skipped",
    );
    return result;
  }

  try {
    const { JPEG, PNG, BMFF, ManifestStore, SuperBox } = c2pa;

    let asset;
    if (
      mediaType === "image/jpeg" ||
      mediaType === "image/jpg" ||
      JPEG.canRead(buffer)
    ) {
      asset = new JPEG(buffer);
    } else if (mediaType === "image/png" || PNG.canRead(buffer)) {
      asset = new PNG(buffer);
    } else if (BMFF.canRead(buffer)) {
      asset = new BMFF(buffer);
    } else {
      result.status = "no_manifest";
      result.signals.push(`Unsupported format for C2PA: ${mediaType}`);
      return result;
    }

    let jumbf;
    try {
      jumbf = asset.getManifestJUMBF();
    } catch (extractErr) {
      result.status = "no_manifest";
      result.signals.push(
        "No C2PA manifest embedded — image was not signed at capture",
      );
      return result;
    }
    if (!jumbf || jumbf.length === 0) {
      result.status = "no_manifest";
      result.signals.push(
        "No C2PA manifest embedded — image was not signed at capture",
      );
      return result;
    }

    const superBox = SuperBox.fromBuffer(jumbf);
    const manifestStore = ManifestStore.fromSuperBox(superBox);

    if (!manifestStore) {
      result.status = "no_manifest";
      result.signals.push("C2PA data found but could not parse manifest store");
      return result;
    }

    const validationResult = await manifestStore.validate(buffer);

    const activeManifest = manifestStore.activeManifest;
    if (activeManifest) {
      result.claimGenerator = activeManifest.claimGenerator || null;

      if (activeManifest.assertions) {
        result.assertions = activeManifest.assertions.map((a) => ({
          label: a.label,
        }));
      }
    }

    const hasErrors = validationResult?.errors?.length > 0;

    if (!hasErrors) {
      result.status = "verified";
      result.signals.push(
        `✅ C2PA VERIFIED${
          result.claimGenerator
            ? ` — claim generator: ${result.claimGenerator}`
            : ""
        }`,
      );
    } else {
      result.status = "invalid";
      result.signals.push(
        "⚠️ C2PA manifest found but validation FAILED — image may have been tampered with",
      );
    }
  } catch (err) {
    result.status = "no_manifest";
    result.signals.push(
      "No C2PA manifest embedded — image was not signed at capture",
    );
  }

  return result;
}

export async function checkRealityDefender(buffer, mediaType, filename) {
  const result = {
    layer: "reality_defender",
    status: "unknown",
    score: null,
    signals: [],
  };

  const rd = await loadRealityDefender();
  if (!rd) {
    result.status = "unavailable";
    result.signals.push(
      "Reality Defender not configured — AI detection skipped",
    );
    return result;
  }

  try {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");

    const tempPath = path.join(
      os.tmpdir(),
      `rd_${Date.now()}_${filename || "evidence.jpg"}`,
    );
    fs.writeFileSync(tempPath, buffer);

    try {
      const detection = await rd.detect({ filePath: tempPath });

      if (detection) {
        const aiScore =
          detection.fake_probability ??
          detection.fakeScore ??
          detection.score ??
          null;

        if (aiScore !== null && aiScore !== undefined) {
          result.score =
            typeof aiScore === "number" ? aiScore : parseFloat(aiScore);

          if (result.score < 0.3) {
            result.status = "real";
            result.signals.push(
              `Reality Defender: ${(result.score * 100).toFixed(
                0,
              )}% AI probability — likely authentic`,
            );
          } else if (result.score < 0.7) {
            result.status = "inconclusive";
            result.signals.push(
              `Reality Defender: ${(result.score * 100).toFixed(
                0,
              )}% AI probability — inconclusive`,
            );
          } else {
            result.status = "ai_generated";
            result.signals.push(
              `⚠️ Reality Defender: ${(result.score * 100).toFixed(
                0,
              )}% AI probability — likely AI-generated`,
            );
          }
        } else {
          result.status = "inconclusive";
          result.signals.push(
            `Reality Defender returned a result but no numeric score. Raw: ${JSON.stringify(
              detection,
            ).slice(0, 200)}`,
          );
        }
      }
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
  } catch (err) {
    result.status = "error";
    result.signals.push(`Reality Defender error: ${err.message}`);
  }

  return result;
}

export async function runProvenanceChecks(buffer, mediaType, filename) {
  const startTime = Date.now();

  const [exif, c2pa, realityDefender] = await Promise.all([
    checkExif(buffer, mediaType),
    checkC2PA(buffer, mediaType),
    checkRealityDefender(buffer, mediaType, filename),
  ]);

  const elapsed = Date.now() - startTime;

  const trustLevel = computeTrustLevel(exif, c2pa, realityDefender);

  return {
    trust_level: trustLevel.level,
    trust_summary: trustLevel.summary,
    elapsed_ms: elapsed,
    checks: {
      exif,
      c2pa,
      reality_defender: realityDefender,
    },
  };
}

function computeTrustLevel(exif, c2pa, rd) {
  if (c2pa.status === "verified" && rd.status !== "ai_generated") {
    return {
      level: "high",
      summary:
        "Image has verified C2PA provenance — cryptographically signed at capture.",
    };
  }

  if (rd.status === "ai_generated") {
    return {
      level: "untrusted",
      summary: `Reality Defender flagged this image as likely AI-generated (${(
        (rd.score || 0) * 100
      ).toFixed(
        0,
      )}% probability). Evidence should be treated with extreme caution.`,
    };
  }

  if (c2pa.status === "invalid") {
    return {
      level: "untrusted",
      summary:
        "C2PA manifest found but validation failed — image may have been tampered with after signing.",
    };
  }

  if (exif.status === "authentic" && rd.status === "real") {
    return {
      level: "medium",
      summary:
        "Image has authentic camera metadata and passed AI detection. No C2PA provenance, but multiple signals suggest genuine capture.",
    };
  }

  if (exif.status === "authentic") {
    return {
      level: "medium",
      summary:
        "Image has authentic camera metadata (make, model, timestamp). No C2PA provenance available.",
    };
  }

  if (exif.status === "no_data" && rd.status === "real") {
    return {
      level: "low",
      summary:
        "No camera metadata found, but Reality Defender indicates the image is likely authentic. Could be a screenshot or processed image.",
    };
  }

  if (exif.status === "suspicious") {
    return {
      level: "low",
      summary:
        "Image metadata is suspicious — missing camera info or edited with image manipulation software.",
    };
  }

  return {
    level: "low",
    summary:
      "Insufficient provenance data. Image lacks camera metadata and C2PA credentials. Treat with caution.",
  };
}
