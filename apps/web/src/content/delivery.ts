import photos from "./delivery-gallery.json" with { type: "json" };
import type { Locale } from "@/lib/i18n";

export function deliveryPhotos(locale: Locale, program?: string) {
  return photos.filter((photo) => program ? photo.program === program : photo.role !== "library").map((photo) => {
    const title = locale === "ar" ? photo.titleAr : photo.titleEn;
    const place = locale === "ar" ? photo.placeAr : photo.placeEn;
    return { image: photo.url, title, place, program: photo.program, width: photo.width, height: photo.height };
  });
}
