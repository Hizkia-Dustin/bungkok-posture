import { FigmaIcon, figmaAsset } from "../common/FigmaAsset";
import { useAboutMotion } from "../../hooks/useAboutMotion";
import "../../styles/about-motion.css";

// ============================================================================
// DATA FOTO KOLASE SEKSI ABOUT
// Format: [Nama File Gambar WebP, Posisi CSS, Kecepatan Parallax]
// ============================================================================
const photos = [
  ["3268b.webp", "workspace", 0.65],
  ["61eac.webp", "consultation", 0.9],
  ["45572.webp", "awareness", 0.5],
  ["fcf3d.webp", "webcam", 1.1],
  ["219ee.webp", "spine", 0.8],
  ["ef508.webp", "break", 0.55],
  ["0a9ed.webp", "monitor", 1],
];

// ============================================================================
// KOMPONEN: ProductBenefits
// Menampilkan 3 pilar manfaat Bungkok (Pantau postur, Ingatkan lembut, Lacak kebiasaan)
// ============================================================================
export function ProductBenefits() {
  return (
    <div className="product-benefits">
      <span>
        <FigmaIcon file="00042.svg" />
        Pantau
        <br />
        postur
      </span>
      <span>
        <FigmaIcon file="80460.svg" />
        Ingatkan
        <br />
        dengan lembut
      </span>
      <span>
        <FigmaIcon file="252b7.svg" />
        Lacak
        <br />
        kebiasaan
      </span>
    </div>
  );
}

// ============================================================================
// KOMPONEN UTAMA: AboutBungkok
// Seksi "About Bungkok" pada Landing Page dengan efek foto kolase parallax
// ============================================================================
export default function AboutBungkok() {
  const motionRoot = useAboutMotion();
  return (
    <section id="about" className="landing-about" ref={motionRoot}>
      {/* Kolase foto dekoratif bergeser saat scrolling */}
      <div className="about-collage" aria-hidden="true">
        {photos.map(([file, position, speed]) => (
          <div
            key={file}
            className={`about-photo about-photo-${position}`}
            data-about-depth={speed}
          >
            <img
              src={figmaAsset(file)}
              alt=""
              width="360"
              height="240"
              loading="lazy"
            />
          </div>
        ))}
        {/* Foto rontgen tulang belakang di tengah */}
        <div className="about-center-photo" data-about-depth="0.22">
          <img
            src={figmaAsset("2c710.webp")}
            alt=""
            width="733"
            height="461"
            loading="lazy"
          />
        </div>
      </div>

      {/* Teks penjelasan pengantar produk */}
      <div className="about-copy">
        <h2>about bungkok</h2>
        <p>
          BUNGKOK ADALAH WEB APP UNTUK MEMBANTU KAMU MEMBANGUN
          <br /> KESADARAN SAAT DUDUK MELALUI PEMANTAUAN POSTUR BERBASIS WEB CAM
        </p>
        <ProductBenefits />
      </div>
    </section>
  );
}
