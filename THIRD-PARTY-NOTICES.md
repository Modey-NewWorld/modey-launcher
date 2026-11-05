# Third-Party Notices & Licenses

Modey Launcher incorporates or interacts with open-source software and creative assets under various licenses. This document lists all third-party components, their respective authors, and their licensing terms.

---

## 1. Upstream Framework: EML Template & EML Lib
- **Component**: Electron Minecraft Launcher (EML Template & `eml-lib`)
- **Author**: GoldFrite (https://github.com/GoldFrite/EML-Template, https://github.com/GoldFrite/eml-lib)
- **License**: MIT License
- **Copyright**: Copyright (c) 2026 GoldFrite

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. 3D Skin Viewer: skinview3d
- **Component**: `skinview3d`
- **Author**: invis_ghost (https://github.com/bs-community/skinview3d)
- **License**: MIT License
- **Copyright**: Copyright (c) 2020-2023 invis_ghost

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. Icon Set: Solar Icons
- **Component**: Solar Icons (Bold & Linear SVG sprite)
- **Author**: 480 Design (https://solaricons.com)
- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Copyright**: Copyright (c) 480 Design

You are free to share and adapt the icons for any purpose, with appropriate credit provided to 480 Design.
Full license text: https://creativecommons.org/licenses/by/4.0/

---

## 4. Background Artwork (`bg.png`)
- **Component**: Default launcher atmospheric artwork (`src/static/images/bg.png`)
- **License**: Creative Commons Attribution-NoDerivatives 3.0 Unported (CC BY-ND 3.0)
- **Terms**: Distributed in its original unedited form for application theming.
Full license text: https://creativecommons.org/licenses/by-nd/3.0/

---

## 5. Minecraft Authentication Agent: authlib-injector
- **Component**: `authlib-injector` (Java Agent)
- **Author**: yushijinhun & contributors (https://github.com/yushijinhun/authlib-injector)
- **License**: GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later) with Execution Exception
- **Exception Notice**: The authlib-injector binary is invoked as a separate runtime `-javaagent` process during Minecraft JVM bootstrap. Under the official execution exception of the project, using authlib-injector as an unmodified standalone javaagent to bridge authentication does not extend the AGPL license obligations to the host launcher codebase.
