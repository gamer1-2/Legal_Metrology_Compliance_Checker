import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

export const exportToPdf = async (
  element: HTMLElement,
  filename: string,
  onProgress?: (status: boolean) => void
) => {
  try {
    if (onProgress) onProgress(true);
    
    // Add a temporary class to hide non-printable elements during capture
    document.body.classList.add('pdf-exporting');
    
    // Select elements that need to be hidden in PDF
    const hiddenElements = element.querySelectorAll('.print\\:hidden');
    hiddenElements.forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });

    const dataUrl = await toPng(element, {
      quality: 1,
      pixelRatio: 2,
      width: element.scrollWidth,
      height: element.scrollHeight,
      style: {
        backgroundColor: '#ffffff',
        maxHeight: 'none',
        overflow: 'visible',
      }
    });

    // Restore hidden elements
    hiddenElements.forEach((el) => {
      (el as HTMLElement).style.display = '';
    });

    document.body.classList.remove('pdf-exporting');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    // Create an image object to get the dimensions of the generated image
    const imgProps = pdf.getImageProperties(dataUrl);
    const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    let position = 0;
    let heightLeft = imgHeight;
    
    pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;
    
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(filename);
  } catch (error) {
    console.error('PDF generation failed:', error);
    alert('Failed to generate PDF. Please try again.');
  } finally {
    document.body.classList.remove('pdf-exporting');
    if (onProgress) onProgress(false);
  }
};
