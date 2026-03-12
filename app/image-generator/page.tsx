"use client";

import { StudioExperience } from "@/app/studio/page";
import { TemplateCopyright, TemplatePageContent } from "@/components/intellect/intellect-shell";

export default function ImageGeneratorPage() {
  return (
    <TemplatePageContent className="pt-[96px]">
      <StudioExperience
        initialMediaMode="image"
        initialMediaModalOpen
        initialVoicePopupOpen={false}
        initialVoiceMode={false}
        embedded
      />
      <TemplateCopyright />
    </TemplatePageContent>
  );
}
