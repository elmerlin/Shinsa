import React, { useRef, useState } from 'react';

// PIU game avatar filenames from /avatars/ directory
const PIU_AVATARS = [
  '0015ee3f24b5766ad193eee77d6e2a4e.png',
  '007b34c60785c9f12ec8473e354402f6.png',
  '02dcbe95815975c92aa48b065fa54b5b.png',
  '02e4f84bca65611e254a134cd864971c.png',
  '02ec651ce5550094cbfc3c0f6624d667.png',
  '062d771f9ce22260f0a39f29b7256e6f.png',
  '066f504c65fd3611e081b2a70c39c147.png',
  '07c16aaee00d066c17f388653f375509.png',
  '0809327fb056c528294a1d20e22760d1.png',
  '0928474b9770d80cc5d1669bd0f3259b.png',
  '0b88ff1250d7520bbeb6c1ee355dd791.png',
  '0ca2fb923c7f6d173feb8ae38996053f.png',
  '0ef99263b1db831b138aa50a1de1a409.png',
  '0f5cbf9469906bbdb4a07deb62d02b4a.png',
  '148ed61b8a006a930286c8cbacc5eb65.png',
  '1714cb21061955169a6e39b765339a7a.png',
  '174eccf2c98ec77dfb83d8b53b38f902.png',
  '1c4a2cb7f5945470b611e700cfc86fa5.png',
  '1c99229e0c024d45ec3b35317ee5730a.png',
  '1d9ff5173d639249d63ee9901637b2cb.png',
  '1df54cb299773ae8dfda2959e76e5009.png',
  '204ecece3614788dec728d8e817949d8.png',
  '205a409f6fbe7cbd6130d6084e65b491.png',
  '2393f33b3d8dc6b4ec03fb7d3b7ce845.png',
  '26860366a60c910aa9e95f430926f855.png',
  '27db599503b6bd92d0dfc1b6cf5dafab.png',
  '2a0d7b807254b39e58039addbbd8d2ab.png',
  '2af9cc524bc5e63a03706b093344fee8.png',
  '2b37a1ac5c881384cb1f79d94ec20185.png',
  '2c862079eee6be3bac006f385a683460.png',
  '2f52b0799bb4a61064983ca8237cd317.png',
  '306444d5a305a3662a04d07613042865.png',
  '32136145f509e1ed81ff067c00b4b034.png',
  '33ecd96b847c0f8433ca999e63ba6c75.png',
  '34125cc217989582d2d80c2051961154.png',
  '3471d6874d5ec26b2e334ab9b60ee2b6.png',
  '38be9d13894a90c796c6dba77a72c49d.png',
  '39ee85e4119925edff462559b97dc54c.png',
  '3b1f557fa939dbb0443dcaa8748ae11b.png',
  '3ca47f5df09ac01a7678df53d39533e6.png',
  '3d930dcd746314e94542b763a2805504.png',
  '3dbd4b75cc14a338e2253a708c77a5b8.png',
  '3efae2202bc24e85c22bf1280801f982.png',
  '41933c642e404a1f1abece4a6185cfb6.png',
  '41b7d75b8f2ef1be9e16a1acae6bdd4e.png',
  '420b610d3688cd7d3335fe59e1a1ce15.png',
  '43d10b867ed9653cadc1b3218e52dfbe.png',
  '44939ce38e58a0e852f518f321efadaf.png',
  '45a87f2672521f65c49bf603447e7357.png',
  '45cbafcb6d086d5b0d10c09b95965ab1.png',
  '484172adaa042f3cec843c4c253463a9.png',
  '4c38402fbef1c19aaa8f3157d4f7ae13.png',
  '4c8827d805d35224ee1651ded58c24e1.png',
  '4cd29544336be400a4e06251c5d39b1c.png',
  '4ecfdcfe096e5d5f2ac973b0522aa274.png',
  '4f617606e7751b2dc2559d80f09c40bf.png',
  '514210469242393201a5b8986f341cd8.png',
  '5449f88cb052ab1dd2908c33fc0766b2.png',
  '55c827f5c851b85c5e3b3c896932fa52.png',
  '56c51d772d63baa4ddc385090a498dcc.png',
  '59cee2e0df4c4be1d318e986d491cc47.png',
  '59fa5655e1c010800677e43911822570.png',
  '5ac5db4aa3aaeb7320eb7c2eb687b37a.png',
  '5cadcb1cf596b499b579f39001c5bf07.png',
  '5f71d39281932f4428cf0fd135a35d72.png',
  '617a39ab8b600e929af6b9dda48b7581.png',
  '62d107b0127ce4a03909575ff1823bd3.png',
  '634fc8494577c9bd57b8f59683398751.png',
  '67217161e1a00f1cea4ac9e702cce061.png',
  '6992859b696b2a0e4bd5b607454a5906.png',
  '69bf5806515af7919e1a9dd76246e3d9.png',
  '6a9a7ebdd28cb686c36fac43b55754fd.png',
  '6ac06e7ec80e7f360f340d6bcadcd2bc.png',
  '6ad16ac7c91e1fab89d4d31fcee8be65.png',
  '6afa50fff54b07adb0eaf8bfa841e05c.png',
  '6b0cc0ae9243bb3c5c91931db9c3d92b.png',
  '6d256dba90fbc01f3c9228f94f3023f0.png',
  '6ed01094850e66d34aa4831f567363d4.png',
  '725c122975eb058fde280919f181e456.png',
  '72df055536cc5fa3edf706d83a38f82b.png',
  '739d0710f8115b5bdb0b4c92175ff6a5.png',
  '759bb6007aa0a3a771c4424f1151a0a6.png',
  '75f90236ea58c1c27f5dda7ae85c0d10.png',
  '767d1a3db8c5b1dbb6ea631cf8684acb.png',
  '77ebac59a8a18e91a62c580b546797cc.png',
  '7943a785cb4372305284879af49cdbc3.png',
  '79b22cb277ede285557000e5aa8ef670.png',
  '7a0f025f362dd2153172f4a2e10b57f9.png',
  '7aae77ee552c2c0985c678778ceda0bd.png',
  '7c21a530a20ebfb81431a0ee1b50364c.png',
  '7c44a40f70400bccfcb78b9f9c0106cf.png',
  '7c9cae2720b196047ee881b934c3870a.png',
  '7d4dcf81315460c5012e8bbe21ec0066.png',
  '7d83b199e654fb10f2bbb09fff0bf5c8.png',
  '7d91cd79d7304d7b8ba1ae5479b6cf75.png',
  '7da9639b2ed2e16d06621734d80946af.png',
  '7e48efd1edbffa7926364726dd92fb01.png',
  '81bef6381fab9640e6b4975ac28f10c0.png',
  '82916c6df504442fb3affe9228d98510.png',
  '876697a6cbfb2388981a4285b130638d.png',
  '87f3e27e545447b14c9a5fa6c31dc475.png',
  '89ed1c4662baae04fc8f30f992aa3110.png',
  '8f47a1af5f7065226a073dc7ee278e84.png',
  '8f820f8a6c5457264ea6b4e4b9b8ccbc.png',
  '901ceb863fc221f3e704143c7177e1b3.png',
  '901d48ef538745431eaa94cef7676758.png',
  '910a2d692b335d5ae4f641d693afa5f5.png',
  '9113471082ffeb962d01752f3c1ea7f8.png',
  '943b70763e08c39475d5438384ea2bf4.png',
  '9516a7cc69a1b2b86c6a3541283ca495.png',
  '96cd716cbfe11087778f655ff299c472.png',
  '97a2dc0bb5a4702a0f11ce879407d657.png',
  '990ccbdf6fed014063980ddf93419faf.png',
  '9a54da27d2667430d57096bc61e80d91.png',
  '9b4be2c8f25ab1c2e89442bae71164bb.png',
  '9fe9b4d9676344500d74aead729e4770.png',
  'a0277469778f8fe0282f4fdc84db1b9c.png',
  'a3b9583104258d96d9b163d03e749eec.png',
  'a5ac58c84170a622f8adb8c4e8e30257.png',
  'ac3ff7cb65ee80c99ff09f4354f1674b.png',
  'adc053f1797b03b8d6348f5af65d5dea.png',
  'af39c915995c6ebc88bbfb978e02c3a7.png',
  'b1fcbf39b1aec9779ec42166fc8c6824.png',
  'b4ff9b32acb099631c93c60b031271f4.png',
  'b6d9fd3c725ed872e35c455f53544943.png',
  'b7feb4f1758089808a9d73ec45ba6df0.png',
  'b8096be8f0d76986739bfe1256046e48.png',
  'b82ad4ad4c15026be6ef5c4a542d0539.png',
  'b9c0e4060ec640614964c6ec3b9ec3d7.png',
  'ba58494e4209f88d185a1b8078aa66da.png',
  'baf2178281bd447ce8424ad965131894.png',
  'bc24509984b53ee82c23578d6ce16e44.png',
  'be13a36baf0d31974b5324cd8637383b.png',
  'be67afb724f7176d1888f87b46e01066.png',
  'bf1cbf325b3468dd652b37cefb8394e3.png',
  'c1b8599053c4797ff01025a4cb3574f6.png',
  'c4e46603a5c931efda0dfe3945000b37.png',
  'c66dcf2d509b2fccab8896b3c21f0579.png',
  'c71a2b2037c95c604208db7cc94ca9ef.png',
  'ca28fe88daf82a3aae0aa9d44ddb5afd.png',
  'ccf1e801a6b3b3ac591c8590d60db263.png',
  'cd5a74ed10b9e84620882b501fe3797b.png',
  'ce0e9f464be0c2b2d01adccfbab031f8.png',
  'ce319fff536d3ecec1088e64693a2f5f.png',
  'd24da21a69e2b4a267d43cdaa88fd015.png',
  'd412300fc63b1b72d65d4b51606d827d.png',
  'd6caab7ea7c0d48a9bfb78aff3000a5d.png',
  'd8567e37c73dcac59a568c75c260d1a1.png',
  'ddb083f04b880856a0345904272b63d6.png',
  'e0d5b798263e278dd487795e175cd838.png',
  'e0dd6b4234ed867c128ae26a16b75b04.png',
  'e39bc9c053ae6428c55be2239a5ae725.png',
  'e40030248735bd374bb35d00d6a67a31.png',
  'e87fe3d25615e9b514dfb2727f73df1e.png',
  'e947839f4dabdcbf70388e06165b5dbd.png',
  'e9fc73f96b327c5611ff8c80fd06b9a5.png',
  'eb97120913378496d00f0332453a863c.png',
  'eba954f0f25b5f67e1fbd8665c1586ee.png',
  'edd6b161a7bff3f240aa3049c4f57367.png',
  'eede9451b5f58ff561d7f0ccc269cb84.png',
  'f039ec2acf0e57da779feab8432c53aa.png',
  'f1bfe263a3db5354d319ca4fc052f8aa.png',
  'f8cbb833459f7737016a587dc0e21b5c.png',
  'f9bf2e38ba1894b9ec9f7c74b0e64142.png',
];

export function getAvatarUrl(path) {
  if (!path) return '';
  // Already a full URL or data URI
  if (path.startsWith('data:') || path.startsWith('http')) return path;
  // Relative path from /avatars/
  return path;
}

export default function AvatarPicker({ value, onChange, shape = 'circle', size = 'md' }) {
  const fileInputRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  const sizeClasses = {
    sm: shape === 'circle' ? 'w-12 h-12' : 'w-14 h-14',
    md: shape === 'circle' ? 'w-16 h-16' : 'w-20 h-20',
    lg: shape === 'circle' ? 'w-20 h-20' : 'w-24 h-24',
  };

  const previewSize = sizeClasses[size] || sizeClasses.md;
  const roundClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg';

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handlePresetSelect = (filename) => {
    const path = `/avatars/${filename}`;
    if (value === path) {
      onChange('');
    } else {
      onChange(path);
    }
  };

  const displayAvatars = expanded ? PIU_AVATARS : PIU_AVATARS.slice(0, 24);

  return (
    <div className="space-y-3">
      {/* Current preview + upload button */}
      <div className="flex items-center gap-4">
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`${previewSize} ${roundClass} cursor-pointer overflow-hidden border-2 border-dashed border-piu-border hover:border-piu-accent transition-colors flex items-center justify-center bg-piu-dark shrink-0`}
        >
          {value ? (
            <img src={getAvatarUrl(value)} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-gray-500 text-center leading-tight">Upload<br/>Image</span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <div className="flex-1">
          <p className="text-sm text-gray-400">Avatar</p>
          <p className="text-xs text-gray-600">Upload or choose from PIU avatars below</p>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-xs text-red-400 hover:text-red-300 mt-1"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* PIU avatar grid */}
      <div>
        <p className="text-xs text-gray-500 mb-2">PIU Game Avatars ({PIU_AVATARS.length})</p>
        <div className={`grid grid-cols-8 sm:grid-cols-12 gap-1.5 ${!expanded ? 'max-h-[120px] overflow-hidden' : ''}`}>
          {displayAvatars.map((filename) => {
            const path = `/avatars/${filename}`;
            const isSelected = value === path;
            return (
              <button
                key={filename}
                type="button"
                onClick={() => handlePresetSelect(filename)}
                className={`w-full aspect-square ${roundClass} overflow-hidden border-2 transition-all hover:scale-110 ${
                  isSelected
                    ? 'border-piu-accent shadow-lg shadow-piu-accent/30 scale-110'
                    : 'border-piu-border/50 hover:border-piu-accent/50'
                }`}
              >
                <img src={path} alt="" className="w-full h-full object-cover" loading="lazy" />
              </button>
            );
          })}
        </div>
        {PIU_AVATARS.length > 24 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-piu-accent hover:text-piu-accent/80 mt-2 font-display"
          >
            {expanded ? 'Show less' : `Show all ${PIU_AVATARS.length} avatars`}
          </button>
        )}
      </div>
    </div>
  );
}
