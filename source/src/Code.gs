/**
 * Vietlink photo app on Google Apps Script: only the photo maker, open to anyone with the link, no PIN.
 * Generated from src/ by build.py: edit the source, not the pasted copy.
 * Photos never leave the viewer's device, so this script reads and writes nothing on Google.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Vietlink · Tạo ảnh')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}
