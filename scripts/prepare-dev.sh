set -e

sed -i '' 's/jp.nonbili.nori/jp.nonbili.nori_dev/' app.config.ts
sed -i '' 's/Nori/Nori-dev/' app.config.ts
yes | bun expo prebuild -p android --clean --no-install
