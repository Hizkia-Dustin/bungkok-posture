export const figmaAsset = (file) => `/assets/figma/${file}`;
export function FigmaIcon({ file, className = '', ...props }) {
  return <img src={figmaAsset(file)} alt="" className={`figma-icon ${className}`} {...props} />;
}
