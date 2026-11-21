"""Train ResNet-18 on a labelled fundus dataset (e.g. APTOS 2019). Usage:
python train.py <images_folder> <labels.csv> [out=../backend/models/dr_model.pt] [epochs=15]
CSV needs columns id_code,diagnosis (0-4). Use a GPU if you can; CPU works but is slow."""
import sys, os, csv, random, datetime, torch, torchvision
from PIL import Image
from torchvision import transforms as T
folder, csv_path = sys.argv[1:3]; out = sys.argv[3] if len(sys.argv) > 3 else "../backend/models/dr_model.pt"; epochs = int(sys.argv[4]) if len(sys.argv) > 4 else 15
rows = []
for r in csv.DictReader(open(csv_path)):
    p = next((os.path.join(folder, r["id_code"] + e) for e in (".png", ".jpg", ".jpeg") if os.path.exists(os.path.join(folder, r["id_code"] + e))), None)
    if p: rows.append((p, int(r["diagnosis"])))
random.seed(7); random.shuffle(rows); k = int(len(rows) * 0.8); tr, va = rows[:k], rows[k:]
norm = T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
aug = T.Compose([T.Resize((224, 224)), T.RandomHorizontalFlip(), T.RandomRotation(15), T.ToTensor(), norm]); plain = T.Compose([T.Resize((224, 224)), T.ToTensor(), norm])
class DS(torch.utils.data.Dataset):
    def __init__(s, r, t): s.r, s.t = r, t
    def __len__(s): return len(s.r)
    def __getitem__(s, i): return s.t(Image.open(s.r[i][0]).convert("RGB")), s.r[i][1]
dl = lambda r, t, sh: torch.utils.data.DataLoader(DS(r, t), batch_size=32, shuffle=sh, num_workers=0)
dev = "cuda" if torch.cuda.is_available() else "cpu"
m = torchvision.models.resnet18(weights=torchvision.models.ResNet18_Weights.IMAGENET1K_V1); m.fc = torch.nn.Linear(512, 5); m.to(dev)
cnt = torch.bincount(torch.tensor([y for _, y in tr]), minlength=5).float().clamp(min=1)
loss_fn = torch.nn.CrossEntropyLoss(weight=(cnt.sum() / (5 * cnt)).to(dev)); opt = torch.optim.AdamW(m.parameters(), 3e-4)
def kappa(y, p):  # quadratic weighted kappa
    import numpy as np
    O = np.zeros((5, 5)); [O.__setitem__((a, b), O[a, b] + 1) for a, b in zip(y, p)]
    W = np.array([[(i - j) ** 2 for j in range(5)] for i in range(5)]) / 16; E = np.outer(O.sum(1), O.sum(0)) / O.sum()
    return 1 - (W * O).sum() / max((W * E).sum(), 1e-9)
best = -1
for ep in range(epochs):
    m.train()
    for x, y in dl(tr, aug, True):
        opt.zero_grad(); loss_fn(m(x.to(dev)), y.to(dev)).backward(); opt.step()
    m.eval(); ys, ps = [], []
    with torch.no_grad():
        for x, y in dl(va, plain, False): ps += m(x.to(dev)).argmax(1).cpu().tolist(); ys += y.tolist()
    acc = sum(a == b for a, b in zip(ys, ps)) / len(ys); kp = kappa(ys, ps); print(f"epoch {ep+1}: val acc {acc:.3f}, kappa {kp:.3f}")
    if kp > best:
        best = kp; os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        torch.save({"state_dict": m.cpu().state_dict(), "arch": "resnet18", "version": "resnet18-" + datetime.date.today().isoformat(), "val_acc": acc, "val_kappa": kp}, out); m.to(dev)
print("saved best model to", out)
