// Prologue after the workshop: the amateur performance for Krypotkin, then his welcome under the disco lights.
// Draft text: the general's formulas, Krypotkin's welcome speech from docs/source/krypotkin-speeches.md
// (typos fixed), everything else written for the game and to be checked by the author.

=== amateur ===
#do:show:general,norkin,korochkina,podvalny,syrkov,sedoy,khvostov,kroshkin,cherdakov,zernov,player
#do:place:general:desk:right:speak
Сегодня прибывает товарищ Крыпоткин. Встретим как положено. #speaker:general
Положено — с самодеятельностью. #speaker:general
Три номера. Живая пирамида. Приветственный стих. Транспарант. #speaker:general
Распределиться самим. Доложить. Время пошло. #speaker:general
#do:pose:general:rest
Генерал садится за стол и открывает книгу учёта. Казарма молчит секунды три.
#do:pose:syrkov:point
Пирамида — это я! Я снизу. У меня три сестры на шее сидели, и ничего, выдержал. #speaker:syrkov
Стих напишу я. Товарищ Крыпоткин должен услышать, что мы понимаем. Что мы — понимаем. #speaker:podvalny
Пирамида из крыс. Перед философом взаимопомощи. Очень тонко. #speaker:korochkina
А транспарант Хвостов с утра рисует. Никого не подпускает. #speaker:norkin
Я в пирамиде уже стоял. При прошлом генерале. #speaker:sedoy
А какой он был, прошлый? #speaker:syrkov
Хорошо говорил. #speaker:sedoy
#do:pose:syrkov:rest
Все смотрят на тебя: кто-то должен решить, куда ты встанешь.
* [В пирамиду, к Сыркову]
    ~ flag_set("amateur_pyramid")
    Я с тобой, Сырков. В пирамиду. #speaker:player
    Вот! Наш человек! Ты — во второй ряд. Норкин лёгкий, Норкин — наверх. #speaker:syrkov
    Я? Наверх? Я высоты… чуток боюсь. #speaker:norkin
    ** [Встать наверх самому]
        ~ flag_set("pyramid_top")
        ~ trust_add("norkin", 1)
        Давай я наверх. А ты держи меня снизу. #speaker:player
        Норкин выдыхает так, будто его только что сняли с карниза.
        Держу. То есть буду держать. Чуток. #speaker:norkin
    ** [Сказать, что Норкин справится]
        ~ flag_set("pyramid_norkin")
        Справишься. Ты лёгкий, а мы тебя держим. #speaker:player
        Если я упаду, скажите товарищу Крыпоткину, что это была часть номера. #speaker:norkin
    --
* [Помочь Подвальному со стихом]
    ~ flag_set("amateur_verse")
    Давай помогу со стихом. #speaker:player
    #do:pose:podvalny:speak
    Подвальный разворачивает листок. Почерк ровный, как по линейке.
    «Товарищ Крыпоткин! Мы рады вам! Мы тварей в туннелях не отдадим…» Дальше не идёт. Не отдадим — чего? #speaker:podvalny
    ** [«…ни пяди нам»]
        ~ flag_set("verse_inch")
        «…ни пяди нам»? #speaker:player
        «Мы тварей в туннелях не отдадим ни пяди нам». Не очень по-русски. Зато твёрдо. #speaker:podvalny
    ** [«…родным домам»]
        ~ flag_set("verse_homes")
        «…родным домам»? #speaker:player
        «Мы тварей в туннелях не отдадим родным домам». Получается, что мы их домам не отдадим. Тварей. Ну… так и есть. #speaker:podvalny
    ** [«…по нашим рядам»]
        ~ flag_set("verse_ranks")
        «…по нашим рядам»? #speaker:player
        «Не отдадим по нашим рядам»… Это как будто мы их по рядам раздаём. Нет. Хотя рифма хорошая. Оставим. #speaker:podvalny
    --
    ~ trust_add("podvalny", 1)
    Спасибо. Отец сказал бы, что хромает. Но отец не видел тварей. #speaker:podvalny
    #do:pose:podvalny:rest
* [Посмотреть, что рисует Хвостов]
    ~ flag_set("amateur_banner")
    #do:walk:player:sofa
    Хвостов стоит на коленях над длинной полосой обоев. Красная краска, буквы в рост крысы:
    «СИЛА — В СПЛОЧЁНОСТИ!»
    Красиво, а? Три часа. Спина не гнётся. #speaker:khvostov
    ** [Сказать, что не хватает одной «н»]
        Тут одной «н» не хватает. «Сплочённости». #speaker:player
        Где? … Сплочёности. Сплочённости. Да какая разница. Он старый, не заметит. #speaker:khvostov
        *** [Перерисовать вместе]
            ~ flag_set("banner_fixed")
            Давай перерисуем. Я помогу. #speaker:player
            Хвостов ворчит, но двигается. Вдвоём вы втискиваете «н» между двумя другими. Она выходит чуть ниже остальных, будто присела.
            Теперь грамотно. И кривая. #speaker:khvostov
        *** [Оставить как есть]
            ~ flag_set("banner_error")
            ~ trust_add("khvostov", 1)
            Ладно. Не заметит. #speaker:player
            Вот. Сразу видно — наш человек. #speaker:khvostov
    ** [Сказать, что красиво]
        ~ flag_set("banner_error")
        ~ trust_add("khvostov", 1)
        Красиво. #speaker:player
        Три часа. Ты понимаешь. #speaker:khvostov
    --
-
#do:pose:general:speak
Доложить. #speaker:general
Пирамида — готова! #speaker:syrkov
Стих — готов! #speaker:podvalny
Транспарант — готов. Спина — нет. #speaker:khvostov
Удовлетворительно. Через час — встреча. Разойдись. #speaker:general
#do:pose:general:rest
-> DONE

=== meeting ===
#do:show:general,krypotkin,norkin,korochkina,podvalny,syrkov,sedoy,khvostov,kroshkin,cherdakov,zernov,player
#do:place:krypotkin:hatch:left
#do:light:disco #do:music:disco
Кто-то вкрутил в лампы цветные стёкла. Генерал посмотрел на них и ничего не сказал.
#do:pose:general:attention #do:sfx:stomp
Казарма — смирно! Товарищ Крыпоткин! #speaker:general
#do:walk:krypotkin:center
Он входит медленно. Белая борода до пояса, очки на шнурке, под мышкой толстая книга. Портрет на стене моложе его лет на тридцать.
#do:clap
Спасибо, спасибо… Ну что вы. Ну хватит. Ну ещё чуть-чуть. #speaker:krypotkin
Отставить аплодисменты. Отставить музыку. #speaker:general
#do:music:stop-click #do:light:warm
{
- flag("amateur_pyramid"):
    #do:pose:syrkov:carry
    Сырков приседает, на него лезет второй ряд, на второй ряд — третий.
    { flag("pyramid_top"):
        Ты наверху. Внизу Сырков шепчет «держу, держу», и пирамида правда держится.
    - else:
        Норкин наверху. Он держится за твою голову так, что у тебя звенит в ушах. Но держится.
    }
    Изумительно! Вот она — взаимопомощь. Как я писал… я где-то писал. #speaker:krypotkin
    #do:pose:syrkov:rest
- else:
    Пирамида Сыркова кренится, Сырков кричит «держу!», и она правда держится.
}
{
- flag("amateur_verse"):
    #do:pose:podvalny:speak
    { flag("verse_inch"): «Товарищ Крыпоткин! Мы рады вам! Мы тварей в туннелях не отдадим ни пяди нам!» }
    { flag("verse_homes"): «Товарищ Крыпоткин! Мы рады вам! Мы тварей в туннелях не отдадим родным домам!» }
    { flag("verse_ranks"): «Товарищ Крыпоткин! Мы рады вам! Мы тварей в туннелях не отдадим по нашим рядам!» }
    Крыпоткин снимает очки и протирает их бородой.
    Голубчик… Это же… Вы сами? #speaker:krypotkin
    Сами, товарищ Крыпоткин. Все вместе. #speaker:podvalny
    #do:pose:podvalny:rest
- else:
    Подвальный читает стих. Рифма хромает, голос нет.
}
#do:pose:khvostov:point
Хвостов и Зернов разворачивают транспарант.
{
- flag("banner_fixed"):
    «Сила — в сплочённости!» Хорошо. Хорошо! Моя мысль. Моя. #speaker:krypotkin
    Крыпоткин долго смотрит на маленькую «н», которая присела между двумя другими, и улыбается ей отдельно.
- else:
    «Сила — в сплочё…ности». #speaker:krypotkin
    Он замолкает на одну букву.
    Прекрасно. Прекрасно. #speaker:krypotkin
    Корочкина фыркает так тихо, что слышат все.
}
#do:pose:khvostov:rest
#do:pose:krypotkin:speak
Здравствуйте, здравствуйте, дорогие бойцы, дорогие храбрые крысиные гвардейцы! #speaker:krypotkin
Сегодня я приехал к вам не просто поддержать ваш дух и напомнить, ради чего вы сражаетесь. Я приехал узнать вас поближе, понять, как вам тут живётся и как идут дела! #speaker:krypotkin
Я знаю, что тяжело драться с противником, которого до конца не понимаешь и не можешь даже увидеть. Но я уверен, что вашей отваги и решительности хватит, чтобы победить их всех! #speaker:krypotkin
Помните, что вместе с вами в коммуне борются ваши семьи, друзья, любимые — чтобы вам было легче, чтобы вы были сильнее и храбрее. #speaker:krypotkin
Только благодаря вам вся коммуна и все наши идеи будут жить. Так не вешайте же нос, крысы! Это наш час, наше время показать, что мы не канализационные шавки, а великий и сильный народ. #speaker:krypotkin
Ура! Ура! Ура! #speaker:krypotkin
#do:sfx:stomp
Ура! Ура! Ура! #speaker:podvalny
Подвальный кричит громче всех. Седой открывает рот вместе со всеми, но звука не слышно.
#do:walk:krypotkin:line3
Крыпоткин идёт вдоль строя и пожимает лапы.
Норушкин! Голубчик! #speaker:krypotkin
Норкин, товарищ Крыпоткин. #speaker:norkin
Ну я и говорю. #speaker:krypotkin
Корюшкина! #speaker:krypotkin
Корочкина. #speaker:korochkina
Тем более! #speaker:krypotkin
#do:walk:krypotkin:line5
А вы… Сыров? Сырков? #speaker:krypotkin
Сырков — это я, товарищ Крыпоткин! #speaker:syrkov
Значит, вы — тоже очень приятно. #speaker:krypotkin
* [Назвать своё имя]
    ~ flag_set("named_self")
    ~ trust_add("krypotkin", 1)
    {name()}, товарищ Крыпоткин. #speaker:player
    {name()}. {name()}. Запомню. Я всё запоминаю. #speaker:krypotkin
    Он пишет твоё имя на манжете, карандашом, мелко. Карандаш не пишет.
* [Промолчать]
    ~ flag_set("called_syrov")
    Ты молчишь. Крыпоткин кивает, довольный, что угадал.
    Сыров. Хорошая фамилия. Простая. #speaker:krypotkin
-
#do:pose:general:speak
Товарищ Крыпоткин устал с дороги. Разойдись. #speaker:general
#do:pose:general:rest
Крыпоткин говорит это совсем тихо, никому:
Я не устал. Я просто старый. #speaker:krypotkin
-> DONE
